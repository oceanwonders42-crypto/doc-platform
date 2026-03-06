"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const queue_1 = require("../services/queue");
const storage_1 = require("../services/storage");
const pageCount_1 = require("../services/pageCount");
const docRecognition_1 = require("../ai/docRecognition");
const textract_1 = require("../ocr/textract");
const caseMatching_1 = require("../services/caseMatching");
const crmAdapter_1 = require("../integrations/crmAdapter");
const buildMedicalEvents_1 = require("../ai/buildMedicalEvents");
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function yearMonth(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}
async function run() {
    console.log("Worker started. Waiting for jobs...");
    while (true) {
        const job = await (0, queue_1.popDocumentJob)();
        if (!job) {
            await sleep(500);
            continue;
        }
        const { documentId, firmId } = job;
        const doc = await prisma_1.prisma.document.findUnique({ where: { id: documentId } });
        if (!doc) {
            console.error("[worker] Document not found, skipping job:", { documentId, firmId });
            continue;
        }
        if (doc.status === "UPLOADED") {
            console.log("[worker] Document already processed (UPLOADED), skipping:", documentId);
            continue;
        }
        try {
            console.log("[worker] Processing job:", { documentId, firmId });
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { status: "PROCESSING" },
            });
            // Download file from MinIO and count pages
            const buf = await (0, storage_1.getObjectBuffer)(doc.spacesKey);
            const pages = await (0, pageCount_1.countPagesFromBuffer)(buf, doc.mimeType, doc.originalName);
            // Update doc + usage metering (atomic upsert + increment)
            await prisma_1.prisma.$transaction(async (tx) => {
                await tx.document.update({
                    where: { id: documentId },
                    data: { pageCount: pages },
                });
                const ym = yearMonth(new Date());
                await tx.usageMonthly.upsert({
                    where: { firmId_yearMonth: { firmId, yearMonth: ym } },
                    create: { firmId, yearMonth: ym, pagesProcessed: pages, docsProcessed: 1 },
                    update: { pagesProcessed: { increment: pages }, docsProcessed: { increment: 1 } },
                });
                await tx.document.update({
                    where: { id: documentId },
                    data: { status: "UPLOADED", processedAt: new Date() },
                });
            });
            // Run recognition for PDFs and images (idempotent: upsert document_recognition)
            const isPdf = doc.mimeType === "application/pdf" ||
                (doc.originalName || "").toLowerCase().endsWith(".pdf");
            const isImage = (doc.mimeType || "").startsWith("image/") ||
                /\.(jpg|jpeg|png|tiff|webp)$/i.test(doc.originalName || "");
            let text = "";
            let ocrProvider = null;
            let ocrConfidence = null;
            let ocrJsonKey = null;
            if (isPdf) {
                text = await (0, docRecognition_1.extractTextFromPdf)(buf);
                if ((0, textract_1.isOcrNeeded)(text.length)) {
                    console.log(`[worker] low text length (${text.length} < ${textract_1.OCR_TEXT_THRESHOLD}), running OCR fallback: ${documentId}`);
                    const ocrResult = await (0, textract_1.runTextract)(buf, documentId, doc.mimeType);
                    if (ocrResult.text) {
                        text = ocrResult.text;
                        ocrProvider = ocrResult.provider;
                        ocrConfidence = ocrResult.confidence;
                        ocrJsonKey = ocrResult.rawJsonKey;
                    }
                }
            }
            else if (isImage) {
                const ocrResult = await (0, textract_1.runTextract)(buf, documentId, doc.mimeType);
                text = ocrResult.text || "";
                ocrProvider = ocrResult.provider;
                ocrConfidence = ocrResult.confidence;
                ocrJsonKey = ocrResult.rawJsonKey;
            }
            if (isPdf || isImage) {
                try {
                    const result = (0, docRecognition_1.classifyAndExtract)(text);
                    await pg_1.pgPool.query(`
            insert into document_recognition
            (document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, ocr_provider, ocr_confidence, ocr_json_key)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            on conflict (document_id) do update set
              text_excerpt = excluded.text_excerpt,
              doc_type = excluded.doc_type,
              client_name = excluded.client_name,
              case_number = excluded.case_number,
              incident_date = excluded.incident_date,
              confidence = excluded.confidence,
              ocr_provider = excluded.ocr_provider,
              ocr_confidence = excluded.ocr_confidence,
              ocr_json_key = excluded.ocr_json_key,
              updated_at = now()
            `, [
                        documentId,
                        result.excerpt,
                        result.docType,
                        result.clientName,
                        result.caseNumber,
                        result.incidentDate,
                        result.confidence,
                        ocrProvider,
                        ocrConfidence,
                        ocrJsonKey,
                    ]);
                    const rec = result;
                    // Case matching: try to assign or suggest a case
                    const match = await (0, caseMatching_1.matchDocumentToCase)(firmId, {
                        caseNumber: rec.caseNumber,
                        clientName: rec.clientName,
                        incidentDate: rec.incidentDate,
                    }, doc.routedCaseId);
                    await pg_1.pgPool.query(`update document_recognition set match_confidence = $1, match_reason = $2, updated_at = now() where document_id = $3`, [match.matchConfidence, match.matchReason, documentId]);
                    const autoAssign = match.matchConfidence > 0.9 && match.caseId != null;
                    const needsReview = match.matchConfidence >= 0.5 && match.matchConfidence <= 0.9;
                    const unmatched = match.matchConfidence < 0.5;
                    await prisma_1.prisma.document.update({
                        where: { id: documentId },
                        data: {
                            extractedFields: {
                                docType: rec.docType,
                                caseNumber: rec.caseNumber,
                                clientName: rec.clientName,
                                incidentDate: rec.incidentDate,
                                excerptLength: (rec.excerpt || "").length,
                                ...("medicalRecord" in rec && rec.medicalRecord ? { medicalRecord: rec.medicalRecord } : {}),
                            },
                            confidence: rec.confidence,
                            status: autoAssign ? "UPLOADED" : needsReview ? "NEEDS_REVIEW" : unmatched ? "UNMATCHED" : undefined,
                            ...(autoAssign && match.caseId
                                ? { routedCaseId: match.caseId, routingStatus: "auto-assigned" }
                                : {}),
                            ...(needsReview && match.caseId ? { suggestedCaseId: match.caseId } : {}),
                        },
                    });
                    console.log(`Recognition done: ${documentId} (docType=${rec.docType}, match=${match.matchConfidence})`);
                    // Automatic CRM routing when high-confidence match (no manual approval)
                    if (autoAssign && match.caseId) {
                        const crmSystem = process.env.AUTO_ROUTE_CRM_SYSTEM || "generic";
                        const crmConfig = crmSystem === "generic" && process.env.CRM_WEBHOOK_URL
                            ? { webhook_url: process.env.CRM_WEBHOOK_URL }
                            : undefined;
                        const canRoute = crmSystem !== "generic" || (crmConfig?.webhook_url != null && crmConfig.webhook_url !== "");
                        if (canRoute) {
                            const routeResult = await (0, crmAdapter_1.routeDocumentToCrm)(documentId, crmSystem, match.caseId, crmConfig);
                            if (routeResult.ok) {
                                console.log(`[worker] Auto-routed to CRM: ${documentId} -> case ${match.caseId}`);
                            }
                            else {
                                console.warn(`[worker] Auto-route to CRM failed: ${documentId}`, routeResult.error);
                            }
                        }
                        else {
                            console.log(`[worker] Auto-assigned (no CRM webhook configured): ${documentId} -> case ${match.caseId}`);
                        }
                    }
                    // Medical timeline: build and store events only when docType is medical_record
                    if (rec.docType === "medical_record" && "medicalRecord" in rec && rec.medicalRecord) {
                        const medicalRecord = rec.medicalRecord;
                        const events = (0, buildMedicalEvents_1.buildMedicalEvents)(medicalRecord);
                        const caseIdForEvents = match.caseId ?? doc.routedCaseId ?? null;
                        for (const ev of events) {
                            await prisma_1.prisma.medicalEvent.create({
                                data: {
                                    firmId,
                                    caseId: caseIdForEvents,
                                    documentId,
                                    eventDate: ev.eventDate,
                                    eventType: ev.eventType,
                                    facilityName: ev.facilityName ?? undefined,
                                    providerName: ev.providerName ?? undefined,
                                    diagnosis: ev.diagnosis ?? undefined,
                                    procedure: ev.procedure ?? undefined,
                                    amount: ev.amount ?? undefined,
                                    confidence: ev.confidence ?? undefined,
                                },
                            });
                        }
                        if (events.length > 0) {
                            console.log(`[worker] Created ${events.length} medical event(s) for document ${documentId}`);
                        }
                    }
                }
                catch (recErr) {
                    console.error("Recognition error (document left UPLOADED):", recErr);
                }
            }
            console.log(`Done: ${documentId} (pages=${pages})`);
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const errStack = err instanceof Error ? err.stack : undefined;
            console.error("[worker] error", { documentId, firmId, error: errMsg, stack: errStack });
            try {
                await prisma_1.prisma.document.update({
                    where: { id: documentId },
                    data: { status: "FAILED" },
                });
            }
            catch (updateErr) {
                console.error("[worker] failed to set FAILED status:", updateErr);
            }
            await sleep(1000);
        }
    }
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
