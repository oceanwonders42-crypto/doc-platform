"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchDocumentToCase = matchDocumentToCase;
/**
 * Case matching: match a document (recognition result) to a firm Case.
 * Uses raw SQL so it works even when Case/Client are not in Prisma schema.
 */
const pg_1 = require("../db/pg");
function normalize(s) {
    if (s == null)
        return "";
    return String(s).trim().toLowerCase();
}
async function matchDocumentToCase(firmId, signals, existingRoutedCaseId) {
    try {
        if (existingRoutedCaseId) {
            const { rows } = await pg_1.pgPool.query(`SELECT id, "caseNumber", title FROM "Case" WHERE id = $1 AND "firmId" = $2 LIMIT 1`, [existingRoutedCaseId, firmId]);
            if (rows[0]) {
                return {
                    caseId: rows[0].id,
                    caseNumber: rows[0].caseNumber,
                    caseTitle: rows[0].title,
                    matchConfidence: 1,
                    matchReason: "Already routed to this case",
                    unmatchedReason: null,
                };
            }
        }
        const caseNum = normalize(signals.caseNumber);
        if (caseNum.length >= 2 && signals.caseNumber) {
            const { rows: byNumber } = await pg_1.pgPool.query(`SELECT id, "caseNumber", title FROM "Case" WHERE "firmId" = $1 AND LOWER(TRIM("caseNumber")) = LOWER(TRIM($2)) LIMIT 1`, [firmId, signals.caseNumber.trim()]);
            if (byNumber[0]) {
                return {
                    caseId: byNumber[0].id,
                    caseNumber: byNumber[0].caseNumber,
                    caseTitle: byNumber[0].title,
                    matchConfidence: 0.95,
                    matchReason: "Case number match",
                    unmatchedReason: null,
                };
            }
            const { rows: partial } = await pg_1.pgPool.query(`SELECT id, "caseNumber", title FROM "Case" WHERE "firmId" = $1 AND LOWER("caseNumber") LIKE LOWER($2) LIMIT 1`, [firmId, `%${signals.caseNumber.trim()}%`]);
            if (partial[0]) {
                return {
                    caseId: partial[0].id,
                    caseNumber: partial[0].caseNumber,
                    caseTitle: partial[0].title,
                    matchConfidence: 0.8,
                    matchReason: "Partial case number match",
                    unmatchedReason: null,
                };
            }
        }
        const clientName = normalize(signals.clientName);
        if (clientName.length >= 2 && signals.clientName) {
            const { rows: cases } = await pg_1.pgPool.query(`SELECT id, "caseNumber", title, "clientName" FROM "Case" WHERE "firmId" = $1 LIMIT 100`, [firmId]);
            const docNameNorm = clientName.replace(/\s+/g, " ");
            for (const row of cases) {
                const cn = (row.clientName ?? row.client_name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
                if (cn.length >= 2 && (docNameNorm.includes(cn) || cn.includes(docNameNorm))) {
                    return {
                        caseId: row.id,
                        caseNumber: row.caseNumber,
                        caseTitle: row.title,
                        matchConfidence: 0.75,
                        matchReason: `Client name match: ${row.clientName ?? row.client_name}`,
                        unmatchedReason: null,
                    };
                }
            }
        }
    }
    catch (_) {
        // ignore
    }
    return {
        caseId: null,
        caseNumber: null,
        caseTitle: null,
        matchConfidence: 0,
        matchReason: "No matching case found",
        unmatchedReason: "No case number or client name match",
    };
}
