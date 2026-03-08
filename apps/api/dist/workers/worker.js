"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const queue_1 = require("../services/queue");
const storage_1 = require("../services/storage");
const pageCount_1 = require("../services/pageCount");
const docRecognition_1 = require("../ai/docRecognition");
const riskAnalyzer_1 = require("../ai/riskAnalyzer");
const documentInsights_1 = require("../ai/documentInsights");
const documentSummary_1 = require("../ai/documentSummary");
const docClassifier_1 = require("../ai/docClassifier");
const extractors_1 = require("../ai/extractors");
const insuranceOfferExtractor_1 = require("../ai/extractors/insuranceOfferExtractor");
const courtExtractor_1 = require("../ai/extractors/courtExtractor");
const caseMatching_1 = require("../services/caseMatching");
const documentRouting_1 = require("../services/documentRouting");
const featureFlags_1 = require("../services/featureFlags");
const caseTimeline_1 = require("../services/caseTimeline");
const pushService_1 = require("../integrations/crm/pushService");
const notifications_1 = require("../services/notifications");
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function yearMonth(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}
async function handleTimelineRebuild(caseId, firmId) {
    console.log("Processing timeline rebuild job:", { caseId, firmId });
    await (0, caseTimeline_1.rebuildCaseTimeline)(caseId, firmId);
    (0, pushService_1.pushCaseIntelligenceToCrm)({ firmId, caseId, actionType: "timeline_rebuilt" }).catch((e) => console.warn("[crm] push after timeline_rebuilt failed", e));
}
async function handleOcrJob(documentId, firmId) {
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: { status: "PROCESSING", processingStage: "uploaded" },
    });
    const doc = await prisma_1.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc)
        throw new Error(`Document not found: ${documentId}`);
    if (doc.duplicateOfId) {
        console.log(`Skipping duplicate document ${documentId} (duplicateOf ${doc.duplicateOfId})`);
        return;
    }
    const buf = await (0, storage_1.getObjectBuffer)(doc.spacesKey);
    const pages = await (0, pageCount_1.countPagesFromBuffer)(buf, doc.mimeType, doc.originalName);
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.document.update({
            where: { id: documentId },
            data: { pageCount: pages },
        });
        const ym = yearMonth(new Date());
        await tx.usageMonthly.upsert({
            where: { firmId_yearMonth: { firmId, yearMonth: ym } },
            create: {
                firmId,
                yearMonth: ym,
                pagesProcessed: pages,
                docsProcessed: 1,
                insuranceDocsExtracted: 0,
                courtDocsExtracted: 0,
                narrativeGenerated: 0,
                duplicateDetected: 0,
            },
            update: { pagesProcessed: { increment: pages }, docsProcessed: { increment: 1 } },
        });
        await tx.document.update({
            where: { id: documentId },
            data: { status: "UPLOADED", processedAt: new Date() },
        });
    });
    const isPdf = doc.mimeType === "application/pdf" || (doc.originalName || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: { processingStage: "complete" },
        });
        console.log(`Done (non-PDF): ${documentId} (pages=${pages})`);
        return;
    }
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: { processingStage: "ocr" },
    });
    const text = await (0, docRecognition_1.extractTextFromPdf)(buf);
    await pg_1.pgPool.query(`
    insert into document_recognition (document_id, text_excerpt, updated_at)
    values ($1, $2, now())
    on conflict (document_id) do update set
      text_excerpt = excluded.text_excerpt,
      updated_at = now()
    `, [documentId, text]);
    await (0, queue_1.enqueueClassificationJob)({ documentId, firmId });
    console.log(`OCR done, queued classification: ${documentId}`);
}
async function handleClassificationJob(documentId, firmId) {
    const doc = await prisma_1.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc)
        throw new Error(`Document not found: ${documentId}`);
    const { rows } = await pg_1.pgPool.query(`select text_excerpt from document_recognition where document_id = $1`, [documentId]);
    const text = rows[0]?.text_excerpt ?? null;
    if (!text)
        throw new Error(`No text_excerpt for document ${documentId}`);
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: { processingStage: "classification" },
    });
    const generic = (0, docRecognition_1.classifyAndExtract)(text);
    const classification = (0, docClassifier_1.classify)(text, doc.originalName ?? "");
    let finalDocType = classification.docType !== "unknown" ? classification.docType : generic.docType;
    const finalConfidence = classification.docType !== "unknown" ? classification.confidence : generic.confidence;
    const [insuranceOn, courtOn] = await Promise.all([
        (0, featureFlags_1.hasFeature)(firmId, "insurance_extraction"),
        (0, featureFlags_1.hasFeature)(firmId, "court_extraction"),
    ]);
    if ((finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_")) && !insuranceOn)
        finalDocType = "other";
    if ((finalDocType === "court_filing" || finalDocType.startsWith("court_")) && !courtOn)
        finalDocType = "other";
    await pg_1.pgPool.query(`
    insert into document_recognition
    (document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, updated_at)
    values ($1, $2, $3, $4, $5, $6, $7, now())
    on conflict (document_id) do update set
      text_excerpt = excluded.text_excerpt,
      doc_type = excluded.doc_type,
      client_name = excluded.client_name,
      case_number = excluded.case_number,
      incident_date = excluded.incident_date,
      confidence = excluded.confidence,
      updated_at = now()
    `, [
        documentId,
        text,
        finalDocType,
        generic.clientName,
        generic.caseNumber,
        generic.incidentDate,
        finalConfidence,
    ]);
    await (0, queue_1.enqueueExtractionJob)({ documentId, firmId });
    console.log(`Classification done, queued extraction: ${documentId} (docType=${finalDocType})`);
}
async function handleExtractionJob(documentId, firmId) {
    const doc = await prisma_1.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc)
        throw new Error(`Document not found: ${documentId}`);
    const { rows } = await pg_1.pgPool.query(`select text_excerpt, doc_type, client_name, case_number, incident_date, confidence
     from document_recognition where document_id = $1`, [documentId]);
    const rec = rows[0];
    if (!rec?.text_excerpt || !rec.doc_type)
        throw new Error(`Missing recognition data for ${documentId}`);
    const text = rec.text_excerpt;
    const finalDocType = rec.doc_type;
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: { processingStage: "extraction" },
    });
    const baseFields = {
        docType: finalDocType,
        caseNumber: rec.case_number,
        clientName: rec.client_name,
        incidentDate: rec.incident_date,
        excerptLength: text.length,
    };
    const extractedFields = (0, extractors_1.runExtractors)(text, finalDocType, baseFields);
    const [insuranceOn, courtOn] = await Promise.all([
        (0, featureFlags_1.hasFeature)(firmId, "insurance_extraction"),
        (0, featureFlags_1.hasFeature)(firmId, "court_extraction"),
    ]);
    let insuranceFields = null;
    if (insuranceOn && finalDocType.startsWith("insurance_")) {
        insuranceFields = await (0, insuranceOfferExtractor_1.extractInsuranceOfferFields)({ text, fileName: doc.originalName ?? undefined });
    }
    const insuranceFieldsJson = insuranceFields ? JSON.stringify(insuranceFields) : null;
    const courtFieldsJson = courtOn && finalDocType.startsWith("court_")
        ? JSON.stringify(await (0, courtExtractor_1.extractCourtFields)({ text, fileName: doc.originalName ?? undefined }))
        : null;
    const { risks } = (0, riskAnalyzer_1.analyzeRisks)(text);
    const risksJson = risks.length > 0 ? JSON.stringify(risks) : null;
    const { insights } = (0, documentInsights_1.analyzeDocumentInsights)(text);
    const insightsJson = insights.length > 0 ? JSON.stringify(insights) : null;
    const { summary: summaryText, keyFacts } = await (0, documentSummary_1.summarizeDocument)(text);
    const summaryJson = summaryText || keyFacts.length > 0 ? JSON.stringify({ summary: summaryText, keyFacts }) : null;
    await pg_1.pgPool.query(`
    update document_recognition set
      insurance_fields = $1,
      court_fields = $2,
      risks = $3,
      insights = $4,
      summary = $5,
      updated_at = now()
    where document_id = $6
    `, [insuranceFieldsJson, courtFieldsJson, risksJson, insightsJson, summaryJson, documentId]);
    if (insuranceFields?.settlementOffer != null && insuranceFields.settlementOffer > 0) {
        (0, notifications_1.createNotification)(firmId, "settlement_offer_detected", "Settlement offer extracted", `A settlement offer of $${Number(insuranceFields.settlementOffer).toLocaleString()} was extracted from a document.`, { documentId, amount: insuranceFields.settlementOffer }).catch((e) => console.warn("[notifications] settlement_offer_detected (extraction) failed", e));
    }
    const finalConfidence = rec.confidence ?? 0;
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: {
            extractedFields: extractedFields,
            confidence: finalConfidence,
            processingStage: "case_match",
        },
    });
    const ym = yearMonth(new Date());
    if (finalDocType.startsWith("insurance_")) {
        await prisma_1.prisma.usageMonthly.upsert({
            where: { firmId_yearMonth: { firmId, yearMonth: ym } },
            create: {
                firmId,
                yearMonth: ym,
                pagesProcessed: 0,
                docsProcessed: 0,
                insuranceDocsExtracted: 1,
                courtDocsExtracted: 0,
                narrativeGenerated: 0,
                duplicateDetected: 0,
            },
            update: { insuranceDocsExtracted: { increment: 1 } },
        });
    }
    if (finalDocType.startsWith("court_")) {
        await prisma_1.prisma.usageMonthly.upsert({
            where: { firmId_yearMonth: { firmId, yearMonth: ym } },
            create: {
                firmId,
                yearMonth: ym,
                pagesProcessed: 0,
                docsProcessed: 0,
                insuranceDocsExtracted: 0,
                courtDocsExtracted: 1,
                narrativeGenerated: 0,
                duplicateDetected: 0,
            },
            update: { courtDocsExtracted: { increment: 1 } },
        });
    }
    await (0, queue_1.enqueueCaseMatchJob)({ documentId, firmId });
    console.log(`Extraction done, queued case_match: ${documentId}`);
}
async function handleCaseMatchJob(documentId, firmId) {
    const { rows } = await pg_1.pgPool.query(`select case_number, client_name from document_recognition where document_id = $1`, [documentId]);
    const rec = rows[0];
    const caseNumber = rec?.case_number ?? null;
    const clientName = rec?.client_name ?? null;
    const rule = await prisma_1.prisma.routingRule.findUnique({ where: { firmId } });
    const minAutoRouteConfidence = rule?.minAutoRouteConfidence ?? 0.9;
    const autoRouteEnabled = rule?.autoRouteEnabled ?? false;
    const match = await (0, caseMatching_1.matchDocumentToCase)(firmId, { caseNumber, clientName }, null);
    const matchConfidence = match.matchConfidence;
    const matchedCaseId = match.caseId;
    const suggestedCaseId = matchedCaseId;
    if (autoRouteEnabled &&
        suggestedCaseId != null &&
        matchedCaseId != null &&
        matchConfidence >= minAutoRouteConfidence) {
        const routed = await (0, documentRouting_1.routeDocument)(firmId, documentId, matchedCaseId, {
            actor: "system",
            action: "auto_routed",
            routedSystem: "auto",
            routingStatus: "routed",
            metaJson: { matchConfidence, caseId: matchedCaseId },
        });
        if (routed.ok) {
            console.log(`Auto-routed document ${documentId} to case ${matchedCaseId}`);
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { processingStage: "complete" },
            });
        }
        else {
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: {
                    status: "NEEDS_REVIEW",
                    routingStatus: "needs_review",
                    processingStage: "complete",
                },
            });
            await prisma_1.prisma.documentAuditEvent.create({
                data: {
                    firmId,
                    documentId,
                    actor: "system",
                    action: "suggested",
                    fromCaseId: null,
                    toCaseId: matchedCaseId,
                    metaJson: { matchConfidence, reason: routed.error },
                },
            });
        }
    }
    else {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: {
                status: "NEEDS_REVIEW",
                routingStatus: suggestedCaseId != null ? "needs_review" : null,
                processingStage: "complete",
            },
        });
        if (suggestedCaseId != null) {
            await prisma_1.prisma.documentAuditEvent.create({
                data: {
                    firmId,
                    documentId,
                    actor: "system",
                    action: "suggested",
                    fromCaseId: null,
                    toCaseId: matchedCaseId ?? null,
                    metaJson: { matchConfidence, suggestedCaseId },
                },
            });
        }
    }
    await pg_1.pgPool.query(`update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, updated_at = now() where document_id = $3`, [matchConfidence, match.matchReason ?? null, documentId, matchedCaseId]);
    console.log(`Case match done: ${documentId}`);
}
async function run() {
    console.log("Worker started. Waiting for jobs (ocr, classification, extraction, case_match, timeline_rebuild)...");
    while (true) {
        const job = await (0, queue_1.popJob)();
        if (!job) {
            await sleep(500);
            continue;
        }
        try {
            if (job.type === "timeline_rebuild") {
                await handleTimelineRebuild(job.caseId, job.firmId);
                continue;
            }
            const documentId = "documentId" in job ? job.documentId : null;
            const firmId = job.firmId;
            const jobType = job.type ?? (documentId ? "ocr" : null);
            if (!documentId || !jobType) {
                console.warn("Invalid job payload (missing type or documentId):", job);
                continue;
            }
            switch (jobType) {
                case "ocr":
                    await handleOcrJob(documentId, firmId);
                    break;
                case "classification":
                    await handleClassificationJob(documentId, firmId);
                    break;
                case "extraction":
                    await handleExtractionJob(documentId, firmId);
                    break;
                case "case_match":
                    await handleCaseMatchJob(documentId, firmId);
                    break;
                default:
                    console.warn("Unknown job type:", jobType);
            }
        }
        catch (err) {
            const documentId = "documentId" in job ? job.documentId : null;
            const errMsg = err instanceof Error ? err.message : String(err);
            const errStack = err instanceof Error ? err.stack : undefined;
            console.error("[worker] error", { documentId, firmId: job.firmId, error: errMsg, stack: errStack });
            if (documentId) {
                try {
                    await prisma_1.prisma.document.update({
                        where: { id: documentId },
                        data: { status: "FAILED" },
                    });
                }
                catch {
                    // ignore
                }
            }
            await sleep(1000);
        }
    }
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
