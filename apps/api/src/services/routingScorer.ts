/**
 * Document routing scorer: combines case match, patterns, and feedback for explainable routing.
 * Deterministic first (case number / client name), then pattern rules, then feedback boosts.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { getStoredMatchSignalsForDocument, matchDocumentToCase, type MatchSignals } from "./caseMatching";

export type DocumentForRouting = {
  id: string;
  firmId: string;
  originalName: string | null;
  source: string | null;
  routedCaseId: string | null;
  status: string | null;
};

export type ExtractedForRouting = {
  caseNumber?: string | null;
  clientName?: string | null;
  docType?: string | null;
  providerName?: string | null;
  documentClientName?: string | null;
  emailClientName?: string | null;
};

export type RoutingCandidate = {
  caseId: string;
  caseNumber: string | null;
  caseTitle: string | null;
  confidence: number;
  reason: string;
  source: "case_match" | "pattern" | "feedback";
  patternId?: string;
  patternName?: string;
};

export type MatchedPattern = {
  id: string;
  name: string;
  docType: string | null;
  providerName: string | null;
  fileNamePattern: string | null;
  targetCaseId: string | null;
  priority: number;
  scoreContribution: number;
};

export type RoutingScoreResult = {
  chosenCaseId: string | null;
  chosenFolder: string | null;
  chosenDocType: string | null;
  confidence: number;
  candidates: RoutingCandidate[];
  matchedPatterns: MatchedPattern[];
  signals: {
    caseNumber: string | null;
    clientName: string | null;
    docType: string | null;
    fileName: string | null;
    source: string | null;
    baseMatchReason: string | null;
    providerName?: string | null;
    providerMatchReasons?: string[];
    documentClientName?: string | null;
    emailClientName?: string | null;
  };
};

type JsonRecord = Record<string, unknown>;

function normalize(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).trim().toLowerCase();
}

function asRecord(value: unknown): JsonRecord | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const extractedValue = readString(record.extractedValue);
  if (extractedValue) return extractedValue;
  return readString(record.value);
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/** Simple filename pattern: supports * wildcard or includes substring. */
function fileNameMatches(pattern: string | null, fileName: string | null): boolean {
  if (!pattern || !fileName) return false;
  const p = normalize(pattern);
  const f = normalize(fileName);
  if (p.includes("*")) {
    const regex = new RegExp("^" + p.replace(/\*/g, ".*") + "$");
    return regex.test(f);
  }
  return f.includes(p) || p.includes(f);
}

/** Check if doc type matches (pattern can be prefix, e.g. "insurance" matches "insurance_letter"). */
function docTypeMatches(patternDocType: string | null, docType: string | null): boolean {
  if (!patternDocType || !docType) return false;
  const p = normalize(patternDocType);
  const d = normalize(docType);
  return d === p || d.startsWith(p + "_") || p.startsWith(d + "_");
}

export async function scoreDocumentRouting(
  document: DocumentForRouting,
  extracted: ExtractedForRouting,
  ocrText: string | null
): Promise<RoutingScoreResult> {
  const { id: documentId, firmId, originalName, source, routedCaseId, status } = document;
  const signals: RoutingScoreResult["signals"] = {
    caseNumber: extracted.caseNumber ?? null,
    clientName: extracted.clientName ?? null,
    docType: extracted.docType ?? null,
    fileName: originalName,
    source,
    baseMatchReason: null,
    providerName: extracted.providerName ?? null,
    providerMatchReasons: [],
    documentClientName: extracted.documentClientName ?? null,
    emailClientName: extracted.emailClientName ?? null,
  };

  const candidates: RoutingCandidate[] = [];
  const matchedPatterns: MatchedPattern[] = [];

  // 1) Base case match (deterministic)
  const baseSignals: MatchSignals = {
    documentId,
    caseNumber: extracted.caseNumber,
    clientName: extracted.clientName,
  };
  const baseMatch = await matchDocumentToCase(firmId, baseSignals, routedCaseId);
  signals.baseMatchReason = baseMatch.matchReason;

  if (baseMatch.caseId && baseMatch.matchConfidence > 0) {
    candidates.push({
      caseId: baseMatch.caseId,
      caseNumber: baseMatch.caseNumber,
      caseTitle: baseMatch.caseTitle,
      confidence: baseMatch.matchConfidence,
      reason: baseMatch.matchReason,
      source: "case_match",
    });
  }

  // 2) Active routing patterns (higher priority first)
  const patterns = await prisma.routingPattern.findMany({
    where: { firmId, active: true },
    orderBy: { priority: "asc" },
  });

  const ocrLower = (ocrText ?? "").toLowerCase();
  const fileName = originalName ?? "";

  for (const p of patterns) {
    let matches = true;
    if (p.docType && !docTypeMatches(p.docType, extracted.docType ?? null)) matches = false;
    if (p.providerName && extracted.providerName) {
      if (!normalize(extracted.providerName).includes(normalize(p.providerName))) matches = false;
    } else if (p.providerName && !ocrLower.includes(normalize(p.providerName))) matches = false;
    if (p.source && source !== p.source) matches = false;
    if (p.fileNamePattern && !fileNameMatches(p.fileNamePattern, fileName)) matches = false;
    if (p.keywordsJson && Array.isArray(p.keywordsJson)) {
      const keywords = p.keywordsJson as string[];
      const hasAll = keywords.every((k) => ocrLower.includes(normalize(k)));
      if (!hasAll) matches = false;
    }

    if (!matches || !p.targetCaseId) continue;

    const caseRow = await prisma.legalCase.findFirst({
      where: { id: p.targetCaseId, firmId },
      select: { id: true, caseNumber: true, title: true, clientName: true },
    });
    if (!caseRow) continue;

    const patternConfidence = 0.7 + (100 - Math.min(p.priority, 100)) / 500;
    matchedPatterns.push({
      id: p.id,
      name: p.name,
      docType: p.docType,
      providerName: p.providerName,
      fileNamePattern: p.fileNamePattern,
      targetCaseId: p.targetCaseId,
      priority: p.priority,
      scoreContribution: patternConfidence,
    });

    const existing = candidates.find((c) => c.caseId === caseRow.id);
    if (existing) {
      existing.confidence = Math.min(0.98, existing.confidence + 0.1);
      existing.reason = `${existing.reason}; pattern "${p.name}"`;
    } else {
      candidates.push({
        caseId: caseRow.id,
        caseNumber: caseRow.caseNumber,
        caseTitle: caseRow.title,
        confidence: patternConfidence,
        reason: `Pattern: ${p.name}`,
        source: "pattern",
        patternId: p.id,
        patternName: p.name,
      });
    }
  }

  // 3) Historical feedback boost: same provider->case or similar filename->case (simplified)
  const recentFeedback = await prisma.routingFeedback.findMany({
    where: { firmId, wasAccepted: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  for (const fb of recentFeedback) {
    if (!fb.finalCaseId || fb.documentId === documentId) continue;
    const feats = fb.featuresJson as { fileName?: string; docType?: string; clientName?: string; providerName?: string } | null;
    if (!feats) continue;
    let boost = 0;
    if (feats.fileName && fileNameMatches(feats.fileName, fileName)) boost += 0.15;
    if (feats.docType && feats.docType === (extracted.docType ?? "")) boost += 0.1;
    if (feats.providerName && extracted.providerName && normalize(feats.providerName) === normalize(extracted.providerName)) boost += 0.2;
    if (boost <= 0) continue;
    const existing = candidates.find((c) => c.caseId === fb.finalCaseId);
    if (existing) existing.confidence = Math.min(0.98, existing.confidence + boost);
    else {
      const caseRow = await prisma.legalCase.findFirst({
        where: { id: fb.finalCaseId, firmId },
        select: { id: true, caseNumber: true, title: true },
      });
      if (caseRow)
        candidates.push({
          caseId: caseRow.id,
          caseNumber: caseRow.caseNumber,
          caseTitle: caseRow.title,
          confidence: 0.5 + boost,
          reason: "Similar to previously accepted routing",
          source: "feedback",
        });
    }
  }

  // 4) Provider-aware boosts: CaseProvider link, timeline provider
  const providerText = (extracted.providerName ?? "").trim();
  if (providerText.length >= 2) {
    const providerNorm = normalize(providerText);
    const caseProviders = await prisma.caseProvider.findMany({
      where: { firmId },
      include: { provider: { select: { id: true, name: true } }, case: { select: { id: true, caseNumber: true, title: true } } },
    });
    const caseProviderMatch = caseProviders.find(
      (cp) =>
        cp.provider.name &&
        (normalize(cp.provider.name).includes(providerNorm) || providerNorm.includes(normalize(cp.provider.name)))
    );
    if (caseProviderMatch) {
      const boost = 0.25;
      if (signals.providerMatchReasons) signals.providerMatchReasons.push(`Provider "${caseProviderMatch.provider.name}" linked to case`);
      const existing = candidates.find((c) => c.caseId === caseProviderMatch.caseId);
      if (existing) {
        existing.confidence = Math.min(0.98, existing.confidence + boost);
        existing.reason = `${existing.reason}; provider linked to case`;
      } else {
        candidates.push({
          caseId: caseProviderMatch.caseId,
          caseNumber: caseProviderMatch.case.caseNumber,
          caseTitle: caseProviderMatch.case.title,
          confidence: 0.6 + boost,
          reason: `Provider "${caseProviderMatch.provider.name}" linked to case`,
          source: "case_match",
        });
      }
    }
    const timelineEvents = await prisma.caseTimelineEvent.findMany({
      where: { firmId },
      select: { caseId: true, provider: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    for (const te of timelineEvents) {
      if (!te.provider) continue;
      const pNorm = normalize(te.provider);
      if (!pNorm.includes(providerNorm) && !providerNorm.includes(pNorm)) continue;
      const existing = candidates.find((c) => c.caseId === te.caseId);
      const boost = 0.15;
      if (existing) existing.confidence = Math.min(0.98, existing.confidence + boost);
      else {
        const caseRow = await prisma.legalCase.findFirst({
          where: { id: te.caseId, firmId },
          select: { id: true, caseNumber: true, title: true },
        });
        if (caseRow)
          candidates.push({
            caseId: caseRow.id,
            caseNumber: caseRow.caseNumber,
            caseTitle: caseRow.title,
            confidence: 0.5 + boost,
            reason: "Provider appears in case timeline",
            source: "feedback",
          });
      }
      if (signals.providerMatchReasons) signals.providerMatchReasons.push("Provider appears in case timeline");
      break;
    }
  }

  // Pick best candidate
  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0] ?? null;
  const chosenCaseId = best?.caseId ?? null;
  const confidence = best?.confidence ?? 0;

  // chosenFolder: not in schema; could be a tag or null
  const chosenFolder: string | null = null;
  const chosenDocType = extracted.docType ?? null;

  return {
    chosenCaseId,
    chosenFolder,
    chosenDocType,
    confidence,
    candidates,
    matchedPatterns,
    signals,
  };
}

/** Load extracted fields from document_recognition for a document. */
export async function getExtractedForRouting(documentId: string): Promise<ExtractedForRouting | null> {
  const { rows } = await pgPool.query<{
    firm_id: string;
    case_number: string | null;
    client_name: string | null;
    doc_type: string | null;
    provider_name: string | null;
    extracted_fields: unknown;
  }>(
    `
    select
      d."firmId" as firm_id,
      dr.case_number,
      dr.client_name,
      dr.doc_type,
      dr.provider_name,
      d."extractedFields" as extracted_fields
    from document_recognition dr
    join "Document" d on d.id = dr.document_id
    where dr.document_id = $1
    `,
    [documentId]
  );
  const r = rows[0];
  if (!r) return null;

  const storedSignals = await getStoredMatchSignalsForDocument(r.firm_id, documentId).catch(() => null);
  const extractedFields = asRecord(r.extracted_fields);
  const medicalRecord = asRecord(extractedFields?.medicalRecord);

  return {
    caseNumber: firstNonEmpty(r.case_number, storedSignals?.documentCaseNumber),
    clientName: firstNonEmpty(
      r.client_name,
      storedSignals?.documentClientName,
      storedSignals?.emailClientName,
      ...(storedSignals?.courtPartyNames ?? [])
    ),
    docType: firstNonEmpty(r.doc_type, readString(extractedFields?.docType)),
    providerName: firstNonEmpty(
      (r as { provider_name?: string | null }).provider_name ?? null,
      readString(extractedFields?.providerName),
      readString(extractedFields?.provider),
      readString(extractedFields?.facility),
      readString(medicalRecord?.provider),
      readString(medicalRecord?.facility)
    ),
    documentClientName: storedSignals?.documentClientName ?? null,
    emailClientName: storedSignals?.emailClientName ?? null,
  };
}

/** Save a routing score snapshot for explainability. */
export async function saveRoutingScoreSnapshot(
  firmId: string,
  documentId: string,
  result: RoutingScoreResult
): Promise<void> {
  await prisma.routingScoreSnapshot.create({
    data: {
      firmId,
      documentId,
      chosenCaseId: result.chosenCaseId,
      chosenFolder: result.chosenFolder,
      chosenDocType: result.chosenDocType,
      confidence: result.confidence,
      signalsJson: result.signals as object,
      candidatesJson: result.candidates as object[],
    },
  });
}
