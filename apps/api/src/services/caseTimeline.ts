/**
 * Rebuild case timeline from all routed documents and their recognition data.
 * Supports tracks: medical (default), legal (court_*), insurance (insurance_*).
 * When rebuilding, matches event provider/facility text against Provider records
 * and sets facilityId when confidence is good.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { createNotification } from "./notifications";
import { extractAndPersistBillingIfBill } from "./billingExtraction";

const MATCH_CONFIDENCE_THRESHOLD = 0.8;

type ProviderRecord = { id: string; name: string };

/**
 * Match provider/facility text against firm's Provider records.
 * Returns Provider id when confidence >= threshold, else null.
 */
function matchProviderText(
  providers: ProviderRecord[],
  providerText: string | null | undefined
): string | null {
  const text = typeof providerText === "string" ? providerText.trim() : "";
  if (!text || text.length < 2 || providers.length === 0) return null;

  const lower = text.toLowerCase();
  let best: { id: string; score: number } | null = null;

  for (const p of providers) {
    const pName = (p.name || "").trim();
    if (!pName) continue;
    const pLower = pName.toLowerCase();

    let score = 0;
    if (pLower === lower) {
      score = 1;
    } else if (pLower.startsWith(lower) || lower.startsWith(pLower)) {
      score = 0.9;
    } else if (pLower.includes(lower) || lower.includes(pLower)) {
      const longer = pLower.length >= lower.length ? pLower : lower;
      const shorter = pLower.length >= lower.length ? lower : pLower;
      score = shorter.length / longer.length;
      if (score < 0.5) score = 0.5;
    }

    if (score >= MATCH_CONFIDENCE_THRESHOLD && (!best || score > best.score)) {
      best = { id: p.id, score };
    }
  }
  return best?.id ?? null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  court_filing: "Court: Filing",
  court_complaint: "Court: Complaint",
  court_motion: "Court: Motion",
  court_order: "Court: Order",
  court_notice: "Court: Notice",
  court_summons: "Court: Summons",
  insurance_letter: "Insurance: Letter",
  insurance_dec_page: "Insurance: Dec Page",
  insurance_coverage_letter: "Insurance: Coverage Letter",
  insurance_denial_letter: "Insurance: Denial Letter",
  insurance_offer_letter: "Insurance: Offer Letter",
  insurance_adjuster_correspondence: "Insurance: Adjuster Correspondence",
  medical_record: "Medical: Record",
  billing_statement: "Billing: Statement",
  police_report: "Police: Report",
  // Queue 2 Onyx doc types
  er_record: "Medical: ER record",
  imaging_report: "Medical: Imaging report",
  physician_notes: "Medical: Physician notes",
  pcp_notes: "Medical: PCP notes",
  therapy_pt_notes: "Medical: Therapy / PT notes",
  operative_report: "Medical: Operative report",
  medical_bill: "Billing: Medical bill",
  ledger_statement: "Billing: Ledger / statement",
  insurance_correspondence: "Insurance: Correspondence",
  miscellaneous: "Miscellaneous",
};

function parseDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

function getTrack(docType: string | null): "medical" | "legal" | "insurance" {
  if (!docType) return "medical";
  if (docType === "court_filing" || docType.startsWith("court_")) return "legal";
  if (docType === "insurance_letter" || docType.startsWith("insurance_")) return "insurance";
  return "medical";
}

function getEventTypeLabel(docType: string | null): string | null {
  if (!docType) return null;
  return DOC_TYPE_LABELS[docType] ?? docType;
}

export async function rebuildCaseTimeline(caseId: string, firmId: string): Promise<void> {
  const [docs, providers] = await Promise.all([
    prisma.document.findMany({
      where: { routedCaseId: caseId, firmId },
      select: { id: true, extractedFields: true },
    }),
    prisma.provider.findMany({
      where: { firmId },
      select: { id: true, name: true },
    }),
  ]);
  const docIds = docs.map((d: { id: string }) => d.id);
  if (docIds.length === 0) {
    await prisma.caseTimelineEvent.deleteMany({ where: { caseId, firmId } });
    await prisma.caseTimelineRebuild.upsert({
      where: { caseId_firmId: { caseId, firmId } },
      create: { caseId, firmId, rebuiltAt: new Date() },
      update: { rebuiltAt: new Date() },
    });
    return;
  }
  const { rows: recRows } = await pgPool.query<{
    document_id: string;
    doc_type: string | null;
    incident_date: string | null;
    provider_name: string | null;
    facility_name: string | null;
    provider_name_normalized: string | null;
    provider_resolution_status: string | null;
    suggested_provider_id: string | null;
    summary: unknown;
  }>(
    `select document_id, doc_type, incident_date, provider_name, facility_name,
            provider_name_normalized, provider_resolution_status, suggested_provider_id, summary
     from document_recognition where document_id = any($1)`,
    [docIds]
  );
  type RecRow = {
    document_id: string;
    doc_type: string | null;
    incident_date: string | null;
    provider_name: string | null;
    facility_name: string | null;
    provider_name_normalized?: string | null;
    provider_resolution_status?: string | null;
    suggested_provider_id?: string | null;
    summary: unknown;
  };
  const recByDoc = new Map<string, RecRow>(recRows.map((r: RecRow) => [r.document_id, r]));

  await prisma.caseTimelineEvent.deleteMany({ where: { caseId, firmId } });

  for (const doc of docs) {
    const rec = recByDoc.get(doc.id);
    const docType = rec?.doc_type ?? (doc.extractedFields as any)?.docType ?? null;
    const track = getTrack(docType);
    const ef = (doc.extractedFields as Record<string, unknown>) || {};
    const growth = ef.growthExtraction as {
      serviceDates?: {
        primaryServiceDate?: string | null;
        source?: string | null;
        _confidence?: string | null;
      } | null;
      billingSummary?: { totalCharged?: number | null; balance?: number | null; totalPaid?: number | null } | null;
    } | undefined;

    let eventDate: Date | null = null;
    let amount: string | null = null;
    let dateSource: string = "none";
    let dateUncertain = true;

    const growthDateConfidence = growth?.serviceDates?._confidence;
    const useGrowthDate =
      growth?.serviceDates?.primaryServiceDate &&
      growthDateConfidence !== "low";

    if (useGrowthDate && growth?.serviceDates?.primaryServiceDate) {
      eventDate = parseDate(growth.serviceDates.primaryServiceDate);
      dateSource = growth.serviceDates.source ?? "growthExtraction";
      dateUncertain = false;
    }
    if (eventDate == null) {
      if (track === "legal") {
        const court = ef.court as Record<string, unknown> | undefined;
        eventDate =
          parseDate(court?.filingDate as string) ??
          parseDate(court?.hearingDate as string) ??
          parseDate(rec?.incident_date) ??
          null;
        if (eventDate) {
          dateSource = eventDate === parseDate(rec?.incident_date) ? "recognition" : "court";
          dateUncertain = false;
        }
      } else if (track === "insurance") {
        const insurance = ef.insurance as Record<string, unknown> | undefined;
        eventDate =
          parseDate(insurance?.letterDate as string) ??
          parseDate(rec?.incident_date) ??
          null;
        if (eventDate) {
          dateSource = eventDate === parseDate(rec?.incident_date) ? "recognition" : "insurance";
          dateUncertain = false;
        }
        const offer = insurance?.offerAmount;
        amount = offer != null ? String(offer) : null;
      } else {
        const medical = ef.medicalRecord as Record<string, unknown> | undefined;
        eventDate =
          parseDate(medical?.visitDate as string) ??
          parseDate(rec?.incident_date) ??
          null;
        if (eventDate) {
          dateSource = eventDate === parseDate(rec?.incident_date) ? "recognition" : "medicalRecord";
          dateUncertain = false;
        }
        amount =
          medical?.billingAmount != null ? String(medical.billingAmount) : null;
      }
    }
    if (amount == null && growth?.billingSummary) {
      const gb = growth.billingSummary;
      if (gb.totalCharged != null) amount = String(gb.totalCharged);
      else if (gb.balance != null) amount = String(gb.balance);
      else if (gb.totalPaid != null) amount = String(gb.totalPaid);
    }

    const eventType = getEventTypeLabel(docType) ?? rec?.doc_type ?? null;

    let facilityId: string | null = null;
    let provider: string | null = null;
    let diagnosis: string | null = null;
    let procedure: string | null = null;
    let summaryShort: string | null = null;
    let providerSource: string = "none";

    if (track === "medical") {
      const medical = ef.medicalRecord as Record<string, unknown> | undefined;
      const recProvider = rec?.provider_name ?? null;
      const recFacility = rec?.facility_name ?? null;
      const resolvedProviderId =
        rec?.provider_resolution_status === "resolved" && rec?.suggested_provider_id
          ? providers.some((p) => p.id === rec.suggested_provider_id)
            ? rec.suggested_provider_id
            : null
          : null;

      if (medical) {
        const facilityText = (medical.facility as string) ?? recFacility;
        const providerText = (medical.provider as string) ?? recProvider;
        provider = providerText || facilityText || null;
        diagnosis = (medical.diagnosis as string) ?? null;
        procedure = (medical.procedure as string) ?? null;
        if (resolvedProviderId) {
          facilityId = resolvedProviderId;
          providerSource = "resolved";
        } else {
          const matchedId =
            matchProviderText(providers, providerText) ??
            matchProviderText(providers, facilityText) ??
            matchProviderText(providers, recProvider) ??
            matchProviderText(providers, recFacility);
          if (matchedId) {
            facilityId = matchedId;
            providerSource = "fuzzy_match";
          } else if (provider || recProvider || recFacility) providerSource = "recognition";
        }
      } else {
        provider = recProvider || recFacility || null;
        if (resolvedProviderId) {
          facilityId = resolvedProviderId;
          providerSource = "resolved";
        } else {
          const matchedId =
            matchProviderText(providers, recProvider) ?? matchProviderText(providers, recFacility);
          if (matchedId) {
            facilityId = matchedId;
            providerSource = "fuzzy_match";
          } else if (provider) providerSource = "recognition";
        }
      }
      const sum = rec?.summary;
      if (sum && typeof sum === "object" && "summary" in sum && typeof (sum as { summary: string }).summary === "string") {
        summaryShort = ((sum as { summary: string }).summary || "").slice(0, 500);
      }
    }

    const metadata: Record<string, unknown> = track !== "medical" ? { docType } : {};
    if (summaryShort) metadata.summary = summaryShort;
    metadata.dateSource = dateSource;
    metadata.dateUncertain = dateUncertain;
    metadata.providerSource = providerSource;

    await prisma.caseTimelineEvent.create({
      data: {
        caseId,
        firmId,
        documentId: doc.id,
        eventDate,
        eventType,
        track,
        facilityId,
        provider,
        diagnosis,
        procedure,
        amount,
        metadataJson: Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  await prisma.caseTimelineRebuild.upsert({
    where: { caseId_firmId: { caseId, firmId } },
    create: { caseId, firmId, rebuiltAt: new Date() },
    update: { rebuiltAt: new Date() },
  });

  for (const doc of docs) {
    const rec = recByDoc.get(doc.id);
    const docType = rec?.doc_type ?? (doc.extractedFields as any)?.docType ?? null;
    await extractAndPersistBillingIfBill(doc.id, caseId, firmId, docType).catch((e) =>
      console.warn("[caseTimeline] billing extraction failed for", doc.id, e)
    );
  }

  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, firmId },
    select: { title: true, caseNumber: true },
  });
  const caseLabel = legalCase?.title ?? legalCase?.caseNumber ?? caseId;
  createNotification(
    firmId,
    "timeline_updated",
    "Timeline updated",
    `Case timeline was rebuilt: ${caseLabel}`,
    { caseId }
  ).catch((e) => console.warn("[notifications] timeline_updated failed", e));
}
