"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Backfill document_recognition for existing documents so the dashboard shows
 * docType, confidence, clientName, caseNumber and status (NEEDS_REVIEW / UNMATCHED).
 * Also runs case matching and sets Document.status.
 *
 * Usage:
 *   pnpm run backfill:recognition -- --firmId <firmId> [--limit 200]
 *   pnpm run backfill:recognition -- --firmId <firmId> --limit 200 --recomputeMatch
 *
 * --recomputeMatch: Re-run matching on docs that already have recognition (no re-OCR).
 */
require("dotenv/config");
const pg_1 = require("pg");
const prisma_1 = require("../db/prisma");
const storage_1 = require("../services/storage");
const docRecognition_1 = require("../ai/docRecognition");
const textract_1 = require("../ocr/textract");
const caseMatching_1 = require("../services/caseMatching");
const argv = process.argv.slice(2);
const firmIdIdx = argv.indexOf("--firmId");
const firmId = firmIdIdx >= 0 ? argv[firmIdIdx + 1] : null;
const limitIdx = argv.indexOf("--limit");
const limit = limitIdx >= 0 ? Math.min(parseInt(argv[limitIdx + 1], 10) || 200, 500) : 200;
const recomputeMatch = argv.includes("--recomputeMatch");
if (!firmId) {
    console.error("Usage: pnpm run backfill:recognition -- --firmId <firmId> [--limit 200] [--recomputeMatch]");
    process.exit(1);
}
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
}
async function main() {
    let docs;
    if (recomputeMatch) {
        const result = await pool.query(`SELECT d.id, d."firmId", d."routedCaseId",
              r.client_name AS "client_name", r.case_number AS "case_number",
              r.incident_date AS "incident_date", r.confidence AS "confidence"
       FROM "Document" d
       INNER JOIN document_recognition r ON r.document_id = d.id
       WHERE d."firmId" = $1
       ORDER BY d."createdAt" DESC
       LIMIT $2`, [firmId, limit]);
        docs = result.rows;
        console.log(`Recomputing match for ${docs.length} documents with existing recognition (firmId=${firmId}, limit=${limit})`);
    }
    else {
        const result = await pool.query(`SELECT d.id, d."firmId", d."spacesKey", d."mimeType"
       FROM "Document" d
       LEFT JOIN document_recognition r ON r.document_id = d.id
       WHERE d."firmId" = $1 AND r.document_id IS NULL
       ORDER BY d."createdAt" DESC
       LIMIT $2`, [firmId, limit]);
        docs = result.rows;
        console.log(`Backfilling recognition for ${docs.length} documents (firmId=${firmId}, limit=${limit})`);
    }
    let processed = 0;
    let errors = 0;
    for (const doc of docs) {
        try {
            let recognition;
            const docId = doc.id;
            const docFirmId = doc.firmId;
            const routedCaseId = doc.routedCaseId ?? null;
            if (recomputeMatch) {
                recognition = {
                    clientName: doc.client_name ?? null,
                    caseNumber: doc.case_number ?? null,
                    incidentDate: doc.incident_date != null ? String(doc.incident_date) : null,
                    confidence: Number(doc.confidence) || 0,
                };
            }
            else {
                const buffer = await (0, storage_1.getObjectBuffer)(doc.spacesKey);
                let text;
                if (doc.mimeType === "application/pdf") {
                    text = await (0, docRecognition_1.extractTextFromPdf)(buffer);
                }
                else if ((String(doc.mimeType || "")).startsWith("image/")) {
                    const ocr = await (0, textract_1.runTextract)(buffer, docId, doc.mimeType);
                    text = ocr.text;
                }
                else {
                    console.log(`[skip] ${docId} (unsupported mimeType: ${doc.mimeType})`);
                    continue;
                }
                recognition = (0, docRecognition_1.classifyAndExtract)(text);
            }
            const signals = {
                clientName: recognition.clientName,
                caseNumber: recognition.caseNumber,
                incidentDate: recognition.incidentDate,
            };
            const match = await (0, caseMatching_1.matchDocumentToCase)(docFirmId, signals, routedCaseId);
            if (recomputeMatch) {
                await pool.query(`UPDATE document_recognition SET match_confidence = $1, match_reason = $2, updated_at = now() WHERE document_id = $3`, [match.matchConfidence, match.matchReason, docId]);
            }
            else {
                await pool.query(`INSERT INTO document_recognition
           (document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, match_confidence, match_reason, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (document_id) DO UPDATE SET
             text_excerpt = EXCLUDED.text_excerpt,
             doc_type = EXCLUDED.doc_type,
             client_name = EXCLUDED.client_name,
             case_number = EXCLUDED.case_number,
             incident_date = EXCLUDED.incident_date,
             confidence = EXCLUDED.confidence,
             match_confidence = EXCLUDED.match_confidence,
             match_reason = EXCLUDED.match_reason,
             updated_at = now()`, [
                    docId,
                    (recognition.excerpt || "").slice(0, 10000),
                    recognition.docType,
                    recognition.clientName,
                    recognition.caseNumber,
                    recognition.incidentDate,
                    recognition.confidence,
                    match.matchConfidence,
                    match.matchReason,
                ]);
            }
            let newStatus = "UPLOADED";
            const updateData = {
                confidence: recognition.confidence,
            };
            if (match.matchConfidence > 0.9 && match.caseId) {
                updateData.routedCaseId = match.caseId;
                updateData.routingStatus = "auto-assigned";
                newStatus = "UPLOADED";
            }
            else if (match.matchConfidence >= 0.5) {
                updateData.status = "NEEDS_REVIEW";
                updateData.suggestedCaseId = match.caseId ?? null;
                newStatus = "NEEDS_REVIEW";
            }
            else {
                updateData.status = "UNMATCHED";
                updateData.suggestedCaseId = null;
                newStatus = "UNMATCHED";
            }
            await prisma_1.prisma.document.update({
                where: { id: docId },
                data: updateData,
            });
            processed++;
            console.log(`[backfill] ${docId} status=${newStatus} match=${match.matchConfidence} reason=${match.matchReason}`);
        }
        catch (err) {
            errors++;
            console.error(`[err] ${doc.id}`, err instanceof Error ? err.message : String(err));
        }
    }
    console.log(`Done. Processed ${processed}, errors ${errors}.`);
    await pool.end();
    await prisma_1.prisma.$disconnect();
    process.exit(errors > 0 ? 1 : 0);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
