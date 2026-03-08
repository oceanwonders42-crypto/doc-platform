/**
 * Case matching: match a document (recognition result) to a firm Case.
 * Uses raw SQL so it works even when Case/Client are not in Prisma schema.
 */
import { pgPool } from "../db/pg";

function normalize(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).trim().toLowerCase();
}

export type MatchSignals = {
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
          matchConfidence: 0.95,
          matchReason: "Case number match",
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
          matchConfidence: 0.8,
          matchReason: "Partial case number match",
        };
      }
    }

    const clientName = normalize(signals.clientName);
    if (clientName.length >= 2 && signals.clientName) {
      const { rows: clients } = await pgPool.query(
        `SELECT c.id, c.title, c."caseNumber", cl.name as client_name
         FROM "Case" c
         LEFT JOIN "Client" cl ON cl.id = c."clientId"
         WHERE c."firmId" = $1 LIMIT 100`,
        [firmId]
      );
      const docNameNorm = clientName.replace(/\s+/g, " ");
      for (const row of clients) {
        const cn = (row.client_name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
        if (cn.length >= 2 && (docNameNorm.includes(cn) || cn.includes(docNameNorm))) {
          return {
            caseId: row.id,
            caseNumber: row.caseNumber,
            caseTitle: row.title,
            matchConfidence: 0.75,
            matchReason: `Client name match: ${row.client_name}`,
          };
        }
      }
    }
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
