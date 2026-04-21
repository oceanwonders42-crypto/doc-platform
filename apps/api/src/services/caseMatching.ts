/**
 * Case matching: match a document (recognition result) to a firm Case.
 * Uses raw SQL so it works against the current Case/Contact tables without
 * depending on Prisma model drift.
 */
import { pgPool } from "../db/pg";

type JsonRecord = Record<string, unknown>;

function normalize(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).trim().toLowerCase();
}

function normalizeIdentifier(s: string | null | undefined): string {
  return normalize(s).replace(/[^a-z0-9]/g, "");
}

function normalizeClientName(s: string | null | undefined): string {
  if (s == null) return "";
  let raw = String(s).trim();
  if (!raw) return "";
  if (raw.includes(",")) {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 2) {
      raw = `${parts[1]} ${parts[0]}`;
    }
  }
  return raw
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(mr|mrs|ms|dr)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function splitNameTokens(name: string): string[] {
  return name
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

type EmailAutomationField = {
  value?: unknown;
};

type EmailAutomationSnapshot = {
  fields?: {
    clientName?: EmailAutomationField | null;
    claimNumber?: EmailAutomationField | null;
    policyNumber?: EmailAutomationField | null;
  } | null;
};

function getDocumentEmailAutomation(metaJson: unknown): EmailAutomationSnapshot | null {
  const meta = asRecord(metaJson);
  const snapshot = asRecord(meta?.emailAutomation);
  if (!snapshot) return null;
  return snapshot as unknown as EmailAutomationSnapshot;
}

export type MatchSignals = {
  documentId?: string | null;
  caseNumber?: string | null;
  clientName?: string | null;
};

export type MatchResult = {
  caseId: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  matchConfidence: number;
  matchReason: string;
};

type CaseNumberSignalSource = "input" | "recognition" | "document" | "email";
type ClientNameSignalSource = "input" | "recognition" | "document" | "email" | "court_party";

type AggregatedSignal<TSource extends string> = {
  displayValue: string;
  normalized: string;
  sources: Set<TSource>;
};

type CaseMatchRow = {
  id: string;
  caseNumber: string | null;
  title: string | null;
  client_name: string | null;
};

type CandidateFeatures = {
  exactCaseNumberSources: CaseNumberSignalSource[];
  partialCaseNumberSources: CaseNumberSignalSource[];
  exactClientSources: ClientNameSignalSource[];
  fuzzyClientSources: ClientNameSignalSource[];
};

type ScoredCaseCandidate = {
  caseId: string;
  caseNumber: string | null;
  caseTitle: string | null;
  score: number;
  reasons: string[];
  features: CandidateFeatures;
};

export type StoredDocumentMatchSignals = {
  recognitionCaseNumber: string | null;
  recognitionClientName: string | null;
  documentCaseNumber: string | null;
  documentClientName: string | null;
  emailClientName: string | null;
  emailClaimNumber: string | null;
  emailPolicyNumber: string | null;
  courtPartyNames: string[];
};

function addAggregatedSignal<TSource extends string>(
  map: Map<string, AggregatedSignal<TSource>>,
  value: string | null | undefined,
  source: TSource,
  normalizer: (value: string) => string
): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const normalizedValue = normalizer(trimmed);
  if (!normalizedValue) return;
  const existing = map.get(normalizedValue);
  if (existing) {
    existing.sources.add(source);
    return;
  }
  map.set(normalizedValue, {
    displayValue: trimmed,
    normalized: normalizedValue,
    sources: new Set([source]),
  });
}

function hasStrongClientSource(sources: ClientNameSignalSource[]): boolean {
  return sources.some((source) => source === "input" || source === "recognition" || source === "document");
}

function compareClientNames(signal: string, candidate: string): "exact" | "fuzzy" | "none" {
  if (!signal || !candidate) return "none";
  if (signal === candidate) return "exact";
  if (
    Math.min(signal.length, candidate.length) >= 6 &&
    (signal.includes(candidate) || candidate.includes(signal))
  ) {
    return "fuzzy";
  }

  const signalTokens = splitNameTokens(signal);
  const candidateTokens = splitNameTokens(candidate);
  if (signalTokens.length < 2 || candidateTokens.length < 2) return "none";

  const candidateTokenSet = new Set(candidateTokens);
  const overlapCount = signalTokens.filter((token) => candidateTokenSet.has(token)).length;
  if (overlapCount >= Math.min(signalTokens.length, candidateTokens.length)) {
    return "exact";
  }
  if (overlapCount >= 2) {
    return "fuzzy";
  }
  return "none";
}

function collectCaseNumberSignals(
  signals: MatchSignals,
  stored: StoredDocumentMatchSignals | null
): AggregatedSignal<CaseNumberSignalSource>[] {
  const caseNumberSignals = new Map<string, AggregatedSignal<CaseNumberSignalSource>>();
  addAggregatedSignal(caseNumberSignals, signals.caseNumber, "input", normalizeIdentifier);
  addAggregatedSignal(caseNumberSignals, stored?.recognitionCaseNumber, "recognition", normalizeIdentifier);
  addAggregatedSignal(caseNumberSignals, stored?.documentCaseNumber, "document", normalizeIdentifier);
  addAggregatedSignal(caseNumberSignals, stored?.emailClaimNumber, "email", normalizeIdentifier);
  addAggregatedSignal(caseNumberSignals, stored?.emailPolicyNumber, "email", normalizeIdentifier);
  return Array.from(caseNumberSignals.values());
}

function collectClientNameSignals(
  signals: MatchSignals,
  stored: StoredDocumentMatchSignals | null
): AggregatedSignal<ClientNameSignalSource>[] {
  const clientNameSignals = new Map<string, AggregatedSignal<ClientNameSignalSource>>();
  addAggregatedSignal(clientNameSignals, signals.clientName, "input", normalizeClientName);
  addAggregatedSignal(clientNameSignals, stored?.recognitionClientName, "recognition", normalizeClientName);
  addAggregatedSignal(clientNameSignals, stored?.documentClientName, "document", normalizeClientName);
  addAggregatedSignal(clientNameSignals, stored?.emailClientName, "email", normalizeClientName);
  for (const partyName of stored?.courtPartyNames ?? []) {
    addAggregatedSignal(clientNameSignals, partyName, "court_party", normalizeClientName);
  }
  return Array.from(clientNameSignals.values());
}

function scoreCaseCandidate(
  row: CaseMatchRow,
  caseNumberSignals: AggregatedSignal<CaseNumberSignalSource>[],
  clientNameSignals: AggregatedSignal<ClientNameSignalSource>[]
): ScoredCaseCandidate | null {
  const normalizedCaseNumber = normalizeIdentifier(row.caseNumber);
  const normalizedClientName = normalizeClientName(row.client_name);
  const exactCaseNumberSources = new Set<CaseNumberSignalSource>();
  const partialCaseNumberSources = new Set<CaseNumberSignalSource>();
  const exactClientSources = new Set<ClientNameSignalSource>();
  const fuzzyClientSources = new Set<ClientNameSignalSource>();

  for (const signal of caseNumberSignals) {
    if (!normalizedCaseNumber) continue;
    if (signal.normalized === normalizedCaseNumber) {
      for (const source of signal.sources) exactCaseNumberSources.add(source);
      continue;
    }
    if (
      signal.normalized.length >= 4 &&
      (normalizedCaseNumber.includes(signal.normalized) || signal.normalized.includes(normalizedCaseNumber))
    ) {
      for (const source of signal.sources) partialCaseNumberSources.add(source);
    }
  }

  for (const signal of clientNameSignals) {
    const matchType = compareClientNames(signal.normalized, normalizedClientName);
    if (matchType === "exact") {
      for (const source of signal.sources) exactClientSources.add(source);
      continue;
    }
    if (matchType === "fuzzy") {
      for (const source of signal.sources) fuzzyClientSources.add(source);
    }
  }

  if (
    exactCaseNumberSources.size === 0 &&
    partialCaseNumberSources.size === 0 &&
    exactClientSources.size === 0 &&
    fuzzyClientSources.size === 0
  ) {
    return null;
  }

  const reasons: string[] = [];
  let score = 0;

  if (exactCaseNumberSources.size > 0) {
    score = 0.94 + Math.min(0.03, 0.015 * (exactCaseNumberSources.size - 1));
    reasons.push(
      exactCaseNumberSources.has("email") && exactCaseNumberSources.size === 1
        ? "Email-derived case number match"
        : "Case number match"
    );
  } else if (partialCaseNumberSources.size > 0) {
    score = 0.78 + Math.min(0.04, 0.02 * (partialCaseNumberSources.size - 1));
    reasons.push(
      partialCaseNumberSources.has("email") && partialCaseNumberSources.size === 1
        ? "Email-derived partial case number match"
        : "Partial case number match"
    );
  }

  const exactClientSourceList = Array.from(exactClientSources);
  const fuzzyClientSourceList = Array.from(fuzzyClientSources);
  const exactClientSourceCount = exactClientSourceList.length;
  const fuzzyClientSourceCount = fuzzyClientSourceList.length;
  const allClientSources = Array.from(new Set([...exactClientSourceList, ...fuzzyClientSourceList]));
  const hasStrongClientMatch = hasStrongClientSource(allClientSources);
  const hasEmailClientMatch = allClientSources.includes("email");

  if (exactClientSourceCount > 0) {
    score = Math.max(score, hasStrongClientMatch ? 0.72 : 0.62);
    reasons.push(`Client name match: ${row.client_name ?? "unknown client"}`);
  } else if (fuzzyClientSourceCount > 0) {
    score = Math.max(score, hasStrongClientMatch ? 0.58 : 0.52);
    reasons.push(`Partial client name match: ${row.client_name ?? "unknown client"}`);
  }

  if (exactCaseNumberSources.size > 0 && exactClientSourceCount > 0) {
    score += 0.05;
    reasons.push("Case number and client name corroborate");
  } else if (partialCaseNumberSources.size > 0 && exactClientSourceCount > 0) {
    score += 0.12;
    reasons.push("Client name supports partial case number");
  } else if (exactClientSourceCount > 0 && allClientSources.length >= 2) {
    score += 0.08;
    reasons.push("Multiple client-name sources agree");
  }

  if (hasEmailClientMatch && hasStrongClientMatch && exactClientSourceCount > 0) {
    score += 0.04;
    reasons.push("Email-derived and document-derived client names agree");
  }

  const features: CandidateFeatures = {
    exactCaseNumberSources: Array.from(exactCaseNumberSources),
    partialCaseNumberSources: Array.from(partialCaseNumberSources),
    exactClientSources: exactClientSourceList,
    fuzzyClientSources: fuzzyClientSourceList,
  };

  return {
    caseId: row.id,
    caseNumber: row.caseNumber,
    caseTitle: row.title,
    score: Math.min(score, 0.99),
    reasons: Array.from(new Set(reasons)),
    features,
  };
}

function sortCandidates(a: ScoredCaseCandidate, b: ScoredCaseCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.features.exactCaseNumberSources.length !== a.features.exactCaseNumberSources.length) {
    return b.features.exactCaseNumberSources.length - a.features.exactCaseNumberSources.length;
  }
  if (b.features.exactClientSources.length !== a.features.exactClientSources.length) {
    return b.features.exactClientSources.length - a.features.exactClientSources.length;
  }
  const caseNumberCompare = normalize(a.caseNumber).localeCompare(normalize(b.caseNumber));
  if (caseNumberCompare !== 0) return caseNumberCompare;
  return a.caseId.localeCompare(b.caseId);
}

function applyAmbiguityPenalty(candidates: ScoredCaseCandidate[]): void {
  if (candidates.length < 2) return;
  const best = candidates[0];
  const runnerUp = candidates[1];
  const delta = best.score - runnerUp.score;
  const bestHasCaseNumberSignal =
    best.features.exactCaseNumberSources.length > 0 || best.features.partialCaseNumberSources.length > 0;

  if (
    !bestHasCaseNumberSignal &&
    best.features.exactClientSources.length > 0 &&
    runnerUp.features.exactClientSources.length > 0 &&
    delta < 0.12
  ) {
    best.score = Math.min(best.score, 0.44);
    best.reasons = Array.from(new Set([...best.reasons, "Ambiguous client-name match across multiple cases"]));
    return;
  }

  if (!bestHasCaseNumberSignal && delta < 0.08) {
    best.score = Math.min(best.score, 0.6);
    best.reasons = Array.from(new Set([...best.reasons, "Close alternate case candidate"]));
    return;
  }

  if (bestHasCaseNumberSignal && delta < 0.03) {
    best.score = Math.min(best.score, 0.88);
    best.reasons = Array.from(new Set([...best.reasons, "Competing case-number match exists"]));
  }
}

export async function getStoredMatchSignalsForDocument(
  firmId: string,
  documentId: string
): Promise<StoredDocumentMatchSignals | null> {
  const { rows } = await pgPool.query<{
    extracted_fields: unknown;
    meta_json: unknown;
    recognition_case_number: string | null;
    recognition_client_name: string | null;
  }>(
    `
    select
      d."extractedFields" as extracted_fields,
      d."metaJson" as meta_json,
      dr.case_number as recognition_case_number,
      dr.client_name as recognition_client_name
    from "Document" d
    left join document_recognition dr on dr.document_id = d.id
    where d.id = $1 and d."firmId" = $2
    limit 1
    `,
    [documentId, firmId]
  );
  const row = rows[0];
  if (!row) return null;

  const extractedFields = asRecord(row.extracted_fields);
  const emailAutomation = getDocumentEmailAutomation(row.meta_json);
  const courtFields = asRecord(extractedFields?.court);
  const parties = asRecord(courtFields?.parties);

  let emailClientName: string | null = null;
  try {
    const { rows: emailRows } = await pgPool.query<{ client_name_extracted: string | null }>(
      `
      select em.client_name_extracted
      from email_attachments ea
      join email_messages em on em.id = ea.email_message_id
      join mailbox_connections mc on mc.id = em.mailbox_connection_id
      where ea.ingest_document_id = $1
        and mc.firm_id = $2
        and em.client_name_extracted is not null
      order by em.received_at desc nulls last, ea.created_at desc
      limit 1
      `,
      [documentId, firmId]
    );
    emailClientName = emailRows[0]?.client_name_extracted?.trim() || null;
  } catch (_) {
    emailClientName = null;
  }

  return {
    recognitionCaseNumber: row.recognition_case_number ?? null,
    recognitionClientName: row.recognition_client_name ?? null,
    documentCaseNumber: firstNonEmpty(
      readString(extractedFields?.caseNumber),
      readString(extractedFields?.claimNumber),
      readString(extractedFields?.policyNumber),
      readString(courtFields?.caseNumber)
    ),
    documentClientName: readString(extractedFields?.clientName),
    emailClientName: firstNonEmpty(
      readString(emailAutomation?.fields?.clientName),
      emailClientName
    ),
    emailClaimNumber: readString(emailAutomation?.fields?.claimNumber),
    emailPolicyNumber: readString(emailAutomation?.fields?.policyNumber),
    courtPartyNames: uniqueStrings([readString(parties?.plaintiff), readString(parties?.defendant)]),
  };
}

export async function matchDocumentToCase(
  firmId: string,
  signals: MatchSignals,
  existingRoutedCaseId: string | null | undefined
): Promise<MatchResult> {
  try {
    if (existingRoutedCaseId) {
      const { rows } = await pgPool.query(
        `SELECT id, "caseNumber", title FROM "Case" WHERE id = $1 AND "firmId" = $2 LIMIT 1`,
        [existingRoutedCaseId, firmId]
      );
      if (rows[0]) {
        return {
          caseId: rows[0].id,
          caseNumber: rows[0].caseNumber,
          caseTitle: rows[0].title,
          matchConfidence: 1,
          matchReason: "Already routed to this case",
        };
      }
    }

    const storedSignals =
      typeof signals.documentId === "string" && signals.documentId.trim().length > 0
        ? await getStoredMatchSignalsForDocument(firmId, signals.documentId)
        : null;
    const caseNumberSignals = collectCaseNumberSignals(signals, storedSignals);
    const clientNameSignals = collectClientNameSignals(signals, storedSignals);

    if (caseNumberSignals.length === 0 && clientNameSignals.length === 0) {
      return {
        caseId: null,
        caseNumber: null,
        caseTitle: null,
        matchConfidence: 0,
        matchReason: "No matching case found",
      };
    }

    const { rows: cases } = await pgPool.query<CaseMatchRow>(
      `
      select
        c.id,
        c."caseNumber",
        c.title,
        coalesce(nullif(trim(ct."fullName"), ''), nullif(trim(c."clientName"), '')) as client_name
      from "Case" c
      left join "Contact" ct on ct.id = c."clientContactId"
      where c."firmId" = $1
      `,
      [firmId]
    );

    const candidates = cases
      .map((row) => scoreCaseCandidate(row, caseNumberSignals, clientNameSignals))
      .filter((candidate): candidate is ScoredCaseCandidate => candidate != null);

    if (candidates.length === 0) {
      return {
        caseId: null,
        caseNumber: null,
        caseTitle: null,
        matchConfidence: 0,
        matchReason: "No matching case found",
      };
    }

    candidates.sort(sortCandidates);
    applyAmbiguityPenalty(candidates);

    const best = candidates[0];
    return {
      caseId: best.caseId,
      caseNumber: best.caseNumber,
      caseTitle: best.caseTitle,
      matchConfidence: Number(best.score.toFixed(2)),
      matchReason: best.reasons.join("; "),
    };
  } catch (_) {
    // Case/Client tables may not exist
  }
  return {
    caseId: null,
    caseNumber: null,
    caseTitle: null,
    matchConfidence: 0,
    matchReason: "No matching case found",
  };
}
