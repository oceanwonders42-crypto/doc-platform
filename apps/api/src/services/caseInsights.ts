/**
 * Case insights generator: AI-style insights across all case documents.
 * Pipeline: (1) gather documents (2) gather medical events (3) gather insurance insights (4) analyze patterns.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";

export type CaseInsightType =
  | "treatment_gaps"
  | "missing_providers"
  | "liability_disputes"
  | "policy_limits_discovered"
  | "multiple_insurance_carriers"
  | "timeline_gap"
  | "settlement_offer_detected"
  | "degenerative_language"
  | "pre_existing_language";

export type CaseInsight = {
  type: CaseInsightType;
  severity: "low" | "medium" | "high";
  summary: string;
  detail?: string;
  documentIds?: string[];
  meta?: Record<string, unknown>;
};

export type CaseInsightsResult = {
  insights: CaseInsight[];
};

type GatheredDocs = { documentIds: string[] };
type MedicalEvents = {
  timelineEvents: { provider: string | null; eventDate: Date | null; documentId: string }[];
  providerNames: Set<string>;
};
type InsuranceGather = {
  carriers: string[];
  policyLimitsDocs: string[];
  settlementOffers: { docId: string; offer: number }[];
  docInsightsByType: Map<string, string[]>;
  riskDocIdsByType: Map<string, string[]>;
};

export async function getCaseInsights(caseId: string, firmId: string): Promise<CaseInsightsResult> {
  // 1) Gather documents
  const gathered = await gatherDocuments(caseId, firmId);
  if (gathered.documentIds.length === 0) {
    const emptyInsights = await analyzePatternsWithoutDocs(caseId, firmId);
    return { insights: emptyInsights };
  }

  // 2) Gather extracted medical events
  const medical = await gatherMedicalEvents(caseId, firmId);

  // 3) Gather insurance insights (document_recognition.insurance_fields, insights, risks)
  const insurance = await gatherInsuranceInsights(gathered.documentIds);

  // 4) Analyze patterns and build insights
  const insights = await analyzePatterns(gathered, medical, insurance, caseId, firmId);
  return { insights };
}

async function gatherDocuments(caseId: string, firmId: string): Promise<GatheredDocs> {
  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, firmId },
    select: { id: true },
  });
  if (!legalCase) return { documentIds: [] };

  const documents = await prisma.document.findMany({
    where: { routedCaseId: caseId, firmId },
    select: { id: true },
  });
  return { documentIds: documents.map((d) => d.id) };
}

async function gatherMedicalEvents(caseId: string, firmId: string): Promise<MedicalEvents> {
  const timelineEvents = await prisma.caseTimelineEvent.findMany({
    where: { caseId, firmId },
    select: { provider: true, eventDate: true, documentId: true },
    orderBy: { eventDate: "asc" },
  });
  const providerNames = new Set<string>();
  for (const e of timelineEvents) {
    if (e.provider && String(e.provider).trim()) providerNames.add(String(e.provider).trim());
  }
  return { timelineEvents, providerNames };
}

async function gatherInsuranceInsights(documentIds: string[]): Promise<InsuranceGather> {
  const carriers: string[] = [];
  const policyLimitsDocs: string[] = [];
  const settlementOffers: { docId: string; offer: number }[] = [];
  const docInsightsByType = new Map<string, string[]>();
  const riskDocIdsByType = new Map<string, string[]>();

  if (documentIds.length === 0) return { carriers, policyLimitsDocs, settlementOffers, docInsightsByType, riskDocIdsByType };

  const { rows } = await pgPool.query<{
    document_id: string;
    insurance_fields: unknown;
    insights: unknown;
    risks: unknown;
  }>(
    `select document_id, insurance_fields, insights, risks from document_recognition where document_id = any($1)`,
    [documentIds]
  );

  for (const row of rows) {
    const docId = row.document_id;

    if (row.insurance_fields != null && typeof row.insurance_fields === "object") {
      const ins = row.insurance_fields as { insuranceCompany?: string; settlementOffer?: unknown; policyLimits?: unknown };
      if (ins.insuranceCompany && String(ins.insuranceCompany).trim()) {
        carriers.push(String(ins.insuranceCompany).trim());
      }
      const offer = ins.settlementOffer;
      if (typeof offer === "number" && Number.isFinite(offer) && offer > 0) {
        settlementOffers.push({ docId, offer });
      }
      const limits = ins.policyLimits;
      if (limits != null && (typeof limits === "object" ? Object.keys(limits as object).length > 0 : String(limits).trim() !== "")) {
        policyLimitsDocs.push(docId);
      }
    }

    const insights = Array.isArray(row.insights) ? row.insights : (row.insights as { insights?: { type: string }[] })?.insights ?? [];
    for (const i of insights) {
      const t = (i as { type?: string }).type;
      if (!t) continue;
      if (!docInsightsByType.has(t)) docInsightsByType.set(t, []);
      docInsightsByType.get(t)!.push(docId);
    }

    const risks = Array.isArray(row.risks) ? row.risks : (row.risks as { risks?: { type: string }[] })?.risks ?? [];
    for (const r of risks) {
      const t = (r as { type?: string }).type;
      if (!t) continue;
      if (!riskDocIdsByType.has(t)) riskDocIdsByType.set(t, []);
      riskDocIdsByType.get(t)!.push(docId);
    }
  }

  return { carriers, policyLimitsDocs, settlementOffers, docInsightsByType, riskDocIdsByType };
}

async function analyzePatterns(
  gathered: GatheredDocs,
  medical: MedicalEvents,
  insurance: InsuranceGather,
  caseId: string,
  firmId: string
): Promise<CaseInsight[]> {
  const insights: CaseInsight[] = [];

  // Timeline gaps: consecutive events with >30 days between
  const events = medical.timelineEvents.filter((e) => e.eventDate != null);
  const GAP_DAYS_THRESHOLD = 30;
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1].eventDate!.getTime();
    const curr = events[i].eventDate!.getTime();
    const days = (curr - prev) / (24 * 60 * 60 * 1000);
    if (days > GAP_DAYS_THRESHOLD) {
      const docIds = [...new Set([events[i - 1].documentId, events[i].documentId])];
      insights.push({
        type: "timeline_gap",
        severity: days > 90 ? "high" : "medium",
        summary: "Gap in treatment timeline",
        detail: `${Math.round(days)} days between events`,
        documentIds: docIds,
        meta: { days: Math.round(days) },
      });
    }
  }

  // Settlement offer detected: max offer across case docs; sourceDocumentIds = docs with that max
  const maxOffer = insurance.settlementOffers.length > 0 ? Math.max(...insurance.settlementOffers.map((o) => o.offer)) : 0;
  if (maxOffer > 0) {
    const sourceDocIds = insurance.settlementOffers.filter((o) => o.offer === maxOffer).map((o) => o.docId);
    insights.push({
      type: "settlement_offer_detected",
      severity: "high",
      summary: "Settlement offer detected",
      detail: `Maximum offer: $${maxOffer.toLocaleString()}`,
      documentIds: sourceDocIds,
      meta: { maxOffer },
    });
  }

  // Degenerative language: from risks or insights
  const degenerativeRisk = insurance.riskDocIdsByType.get("degenerative") ?? [];
  const degenerativeInsight = insurance.docInsightsByType.get("degenerative") ?? insurance.docInsightsByType.get("degenerative_findings") ?? [];
  const degenerativeDocIds = [...new Set([...degenerativeRisk, ...degenerativeInsight])];
  if (degenerativeDocIds.length > 0) {
    insights.push({
      type: "degenerative_language",
      severity: "medium",
      summary: "Degenerative language in documents",
      detail: `Found in ${degenerativeDocIds.length} document(s)`,
      documentIds: degenerativeDocIds,
    });
  }

  // Pre-existing language: from risks or insights
  const preExistingRisk = insurance.riskDocIdsByType.get("pre_existing") ?? [];
  const preExistingInsight = insurance.docInsightsByType.get("pre_existing") ?? insurance.docInsightsByType.get("pre_existing_condition") ?? [];
  const preExistingDocIds = [...new Set([...preExistingRisk, ...preExistingInsight])];
  if (preExistingDocIds.length > 0) {
    insights.push({
      type: "pre_existing_language",
      severity: "medium",
      summary: "Pre-existing condition language in documents",
      detail: `Found in ${preExistingDocIds.length} document(s)`,
      documentIds: preExistingDocIds,
    });
  }

  // Treatment gaps: from document risks (gap_in_treatment) or document insights (treatment_gap)
  const gapRiskDocs = insurance.riskDocIdsByType.get("gap_in_treatment") ?? [];
  const gapInsightDocs = insurance.docInsightsByType.get("treatment_gap") ?? [];
  const gapDocIds = [...new Set([...gapRiskDocs, ...gapInsightDocs])];
  if (gapDocIds.length > 0) {
    insights.push({
      type: "treatment_gaps",
      severity: "high",
      summary: "Treatment gaps noted in case documents",
      detail: `Found in ${gapDocIds.length} document(s)`,
      documentIds: gapDocIds,
    });
  }

  // Missing providers: outstanding records requests (requested but not received)
  const recordsRequests = await prisma.recordsRequest.findMany({
    where: { caseId, firmId },
    select: { providerName: true, status: true },
  });
  const outstanding = recordsRequests.filter(
    (r) => r.status !== "Received" && r.status !== "Complete" && String(r.status).toLowerCase() !== "received"
  );
  if (outstanding.length > 0) {
    const providers = outstanding.map((r) => r.providerName).filter(Boolean);
    insights.push({
      type: "missing_providers",
      severity: "medium",
      summary: "Missing or outstanding provider records",
      detail: `${outstanding.length} records request(s) not yet received`,
      meta: { count: outstanding.length, providers: [...new Set(providers)], statuses: [...new Set(outstanding.map((r) => r.status))] },
    });
  }

  // Liability disputes: from document risks (liability_disputed) or document insights (liability_dispute)
  const liabilityRiskDocs = insurance.riskDocIdsByType.get("liability_disputed") ?? [];
  const liabilityInsightDocs = insurance.docInsightsByType.get("liability_dispute") ?? [];
  const liabilityDocIds = [...new Set([...liabilityRiskDocs, ...liabilityInsightDocs])];
  if (liabilityDocIds.length > 0) {
    insights.push({
      type: "liability_disputes",
      severity: "high",
      summary: "Liability disputed in case documents",
      detail: `Found in ${liabilityDocIds.length} document(s)`,
      documentIds: liabilityDocIds,
    });
  }

  // Policy limits discovered: from document insights (policy_limits) or insurance_fields.policyLimits
  const policyInsightDocs = insurance.docInsightsByType.get("policy_limits") ?? [];
  const policyFromFields = insurance.policyLimitsDocs;
  const policyDocIds = [...new Set([...policyInsightDocs, ...policyFromFields])];
  if (policyDocIds.length > 0) {
    insights.push({
      type: "policy_limits_discovered",
      severity: "high",
      summary: "Policy limits mentioned or extracted",
      detail: `Found in ${policyDocIds.length} document(s)`,
      documentIds: policyDocIds,
      meta: { documentCount: policyDocIds.length },
    });
  }

  // Multiple insurance carriers: distinct insurance companies across documents
  const uniqueCarriers = [...new Set(insurance.carriers)];
  if (uniqueCarriers.length > 1) {
    insights.push({
      type: "multiple_insurance_carriers",
      severity: "medium",
      summary: "Multiple insurance carriers identified",
      detail: `${uniqueCarriers.length} distinct carrier(s) across case documents`,
      meta: { count: uniqueCarriers.length, carriers: uniqueCarriers.slice(0, 20) },
    });
  }

  return insights;
}

async function analyzePatternsWithoutDocs(caseId: string, firmId: string): Promise<CaseInsight[]> {
  const insights: CaseInsight[] = [];
  const recordsRequests = await prisma.recordsRequest.findMany({
    where: { caseId, firmId },
    select: { providerName: true, status: true },
  });
  const outstanding = recordsRequests.filter(
    (r) => r.status !== "Received" && r.status !== "Complete" && String(r.status).toLowerCase() !== "received"
  );
  if (outstanding.length > 0) {
    insights.push({
      type: "missing_providers",
      severity: "medium",
      summary: "Missing or outstanding provider records",
      detail: `${outstanding.length} records request(s) not yet received`,
      meta: { count: outstanding.length, providers: outstanding.map((r) => r.providerName).filter(Boolean) },
    });
  }
  return insights;
}
