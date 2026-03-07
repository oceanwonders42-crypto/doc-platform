/**
 * Case matching: match a document (recognition result) to a firm Case.
 * Uses raw SQL so it works even when Case/Client are not in Prisma schema.
 */
import { pgPool } from "../db/pg";
import { logWarn } from "../lib/logger";

function normalize(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).trim().toLowerCase();
}

/** Confidence values for auditability. Do not auto-route below firm threshold (e.g. 0.9). */
export const MATCH_CONFIDENCE_EXISTING = 1;
export const MATCH_CONFIDENCE_CASE_NUMBER = 0.95;
export const MATCH_CONFIDENCE_PARTIAL_CASE = 0.8;
export const MATCH_CONFIDENCE_CLIENT_NAME = 0.75;

export type MatchSignals = {
  caseNumber?: string | null;
  clientName?: string | null;
  dob?: string | null;
  dateOfLoss?: string | null;
  claimNumber?: string | null;
  providerRefs?: string[] | null;
};

export type MatchSource = "existing" | "case_number" | "partial_case_number" | "client_name" | "none";

export type MatchResult = {
  caseId: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  matchConfidence: number;
  matchReason: string;
  unmatchedReason: string | null;
  /** Source of match for audit/debug. */
  matchSource: MatchSource;
};

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
          matchConfidence: MATCH_CONFIDENCE_EXISTING,
          matchReason: "Already routed to this case",
          unmatchedReason: null,
          matchSource: "existing",
        };
      }
    }

    const caseNum = normalize(signals.caseNumber);
    if (caseNum.length >= 2 && signals.caseNumber) {
      const { rows: byNumber } = await pgPool.query(
        `SELECT id, "caseNumber", title FROM "Case" WHERE "firmId" = $1 AND LOWER(TRIM("caseNumber")) = LOWER(TRIM($2)) LIMIT 1`,
        [firmId, signals.caseNumber.trim()]
      );
      if (byNumber[0]) {
        return {
          caseId: byNumber[0].id,
          caseNumber: byNumber[0].caseNumber,
          caseTitle: byNumber[0].title,
          matchConfidence: MATCH_CONFIDENCE_CASE_NUMBER,
          matchReason: "Case number match",
          unmatchedReason: null,
          matchSource: "case_number",
        };
      }
      const { rows: partial } = await pgPool.query(
        `SELECT id, "caseNumber", title FROM "Case" WHERE "firmId" = $1 AND LOWER("caseNumber") LIKE LOWER($2) LIMIT 1`,
        [firmId, `%${signals.caseNumber.trim()}%`]
      );
      if (partial[0]) {
        return {
          caseId: partial[0].id,
          caseNumber: partial[0].caseNumber,
          caseTitle: partial[0].title,
          matchConfidence: MATCH_CONFIDENCE_PARTIAL_CASE,
          matchReason: "Partial case number match",
          unmatchedReason: null,
          matchSource: "partial_case_number",
        };
      }
    }

    const clientName = normalize(signals.clientName);
    if (clientName.length >= 2 && signals.clientName) {
      const { rows: cases } = await pgPool.query(
        `SELECT id, "caseNumber", title, "clientName" FROM "Case" WHERE "firmId" = $1 LIMIT 100`,
        [firmId]
      );
      const docNameNorm = clientName.replace(/\s+/g, " ");
      for (const row of cases) {
        const cn = (row.clientName ?? row.client_name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
        if (cn.length >= 2 && (docNameNorm.includes(cn) || cn.includes(docNameNorm))) {
          return {
            caseId: row.id,
            caseNumber: row.caseNumber,
            caseTitle: row.title,
            matchConfidence: MATCH_CONFIDENCE_CLIENT_NAME,
            matchReason: `Client name match: ${row.clientName ?? row.client_name}`,
            unmatchedReason: null,
            matchSource: "client_name",
          };
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logWarn("case_match_error", { firmId, error: msg });
    return {
      caseId: null,
      caseNumber: null,
      caseTitle: null,
      matchConfidence: 0,
      matchReason: "Case matching error",
      unmatchedReason: `Case matching failed: ${msg}`,
      matchSource: "none",
    };
  }
  return {
    caseId: null,
    caseNumber: null,
    caseTitle: null,
    matchConfidence: 0,
    matchReason: "No matching case found",
    unmatchedReason: "No case number or client name match",
    matchSource: "none",
  };
}
