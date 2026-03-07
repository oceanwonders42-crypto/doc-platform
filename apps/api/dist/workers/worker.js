"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const queue_1 = require("../services/queue");
const storage_1 = require("../services/storage");
const thumbnail_1 = require("../services/thumbnail");
const pageCount_1 = require("../services/pageCount");
const ocr_1 = require("../services/ocr");
const errorLog_1 = require("../services/errorLog");
const docRecognition_1 = require("../ai/docRecognition");
const riskAnalyzer_1 = require("../ai/riskAnalyzer");
const documentInsights_1 = require("../ai/documentInsights");
const documentSummary_1 = require("../ai/documentSummary");
const onyxClassifier_1 = require("../ai/onyxClassifier");
const extractors_1 = require("../ai/extractors");
const insuranceOfferExtractor_1 = require("../ai/extractors/insuranceOfferExtractor");
const courtExtractor_1 = require("../ai/extractors/courtExtractor");
const caseMatching_1 = require("../services/caseMatching");
const documentRouting_1 = require("../services/documentRouting");
const reviewQueueEvent_1 = require("../services/reviewQueueEvent");
const extractionConfig_1 = require("../services/extractionConfig");
const extractionEvidence_1 = require("../services/extractionEvidence");
const extractionConsistency_1 = require("../services/extractionConsistency");
const featureFlags_1 = require("../services/featureFlags");
const caseTimeline_1 = require("../services/caseTimeline");
const pushService_1 = require("../integrations/crm/pushService");
const notifications_1 = require("../services/notifications");
const webhooks_1 = require("../services/webhooks");
const duplicateDetection_1 = require("../services/duplicateDetection");
const providerExtraction_1 = require("../services/providerExtraction");
const logger_1 = require("../lib/logger");
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function yearMonth(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}
async function handleTimelineRebuild(caseId, firmId) {
    (0, logger_1.logInfo)("timeline_rebuild_start", { caseId, firmId });
    await (0, caseTimeline_1.rebuildCaseTimeline)(caseId, firmId);
    (0, logger_1.logInfo)("timeline_rebuild_done", { caseId, firmId });
    (0, pushService_1.pushCaseIntelligenceToCrm)({ firmId, caseId, actionType: "timeline_rebuilt" }).catch((e) => (0, logger_1.logWarn)("crm_push_after_timeline_rebuilt_failed", { caseId, firmId, error: e?.message }));
}
async function handleOcrJob(documentId, firmId) {
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: {
            status: "PROCESSING",
            processingStage: "uploaded",
            failureStage: null,
            failureReason: null,
        },
    });
    const doc = await prisma_1.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc)
        throw new Error(`Document not found: ${documentId}`);
    if (doc.duplicateOfId) {
        (0, logger_1.logInfo)("ocr_skipped_duplicate", { documentId, firmId, duplicateOfId: doc.duplicateOfId });
        return;
    }
    let buf;
    try {
        buf = await (0, storage_1.getObjectBuffer)(doc.spacesKey);
    }
    catch (e) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: {
                status: "FAILED",
                failureStage: "fetch",
                failureReason: e?.message ?? "Failed to load file",
                metaJson: doc.metaJson || {}
                    ? { ...doc.metaJson, pipelineError: e?.message ?? "Failed to load file", pipelineStage: "fetch" }
                    : { pipelineError: e?.message ?? "Failed to load file", pipelineStage: "fetch" },
            },
        });
        await (0, errorLog_1.logSystemError)("worker", e, undefined, {
            firmId,
            area: "ocr",
            metaJson: { documentId, stage: "fetch" },
        });
        return;
    }
    let pages;
    try {
        pages = await (0, pageCount_1.countPagesFromBuffer)(buf, doc.mimeType, doc.originalName);
    }
    catch (e) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: {
                status: "FAILED",
                failureStage: "page_count",
                failureReason: e?.message ?? "Page count failed",
                metaJson: { ...(doc.metaJson || {}), pipelineError: e?.message ?? "Page count failed", pipelineStage: "page_count" },
            },
        });
        await (0, errorLog_1.logSystemError)("worker", e, undefined, {
            firmId,
            area: "ocr",
            metaJson: { documentId, stage: "page_count" },
        });
        return;
    }
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
        (0, webhooks_1.emitWebhookEvent)(firmId, "document.processed", {
            documentId,
            status: "UPLOADED",
            pageCount: pages,
            processingStage: "complete",
        }).catch((e) => (0, logger_1.logWarn)("webhook_document_processed_failed", { documentId, firmId, error: e?.message }));
        (0, logger_1.logInfo)("document_done_non_pdf", { documentId, firmId, pages });
        return;
    }
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: { processingStage: "ocr" },
    });
    let ocrResult;
    try {
        ocrResult = await (0, ocr_1.runOcrPipeline)(buf, {
            documentId,
            firmId,
            onOcrFailure: ({ stage, message }) => {
                (0, errorLog_1.logSystemError)("worker", message, undefined, {
                    firmId,
                    area: "ocr",
                    metaJson: { documentId, stage },
                }).catch(() => { });
            },
        });
    }
    catch (e) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: {
                status: "FAILED",
                failureStage: "ocr",
                failureReason: e?.message ?? "OCR failed",
                metaJson: { ...(doc.metaJson || {}), pipelineError: e?.message ?? "OCR failed", pipelineStage: "ocr" },
            },
        });
        await (0, errorLog_1.logSystemError)("worker", e, undefined, {
            firmId,
            area: "ocr",
            metaJson: { documentId, stage: "ocr" },
        });
        return;
    }
    const text = ocrResult.fullText;
    const pageTextsJson = ocrResult.pageTexts.length > 0
        ? JSON.stringify(ocrResult.pageTexts.map((p) => ({ page: p.page, text: p.text })))
        : null;
    try {
        await pg_1.pgPool.query(`
    insert into document_recognition (document_id, text_excerpt, page_texts_json, updated_at,
      detected_language, possible_languages, ocr_engine, ocr_confidence,
      has_handwriting, handwriting_heavy, handwriting_confidence, page_diagnostics, page_count_detected)
    values ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11, $12)
    on conflict (document_id) do update set
      text_excerpt = excluded.text_excerpt,
      page_texts_json = coalesce(excluded.page_texts_json, document_recognition.page_texts_json),
      detected_language = coalesce(excluded.detected_language, document_recognition.detected_language),
      possible_languages = coalesce(excluded.possible_languages, document_recognition.possible_languages),
      ocr_engine = coalesce(excluded.ocr_engine, document_recognition.ocr_engine),
      ocr_confidence = coalesce(excluded.ocr_confidence, document_recognition.ocr_confidence),
      has_handwriting = coalesce(excluded.has_handwriting, document_recognition.has_handwriting),
      handwriting_heavy = coalesce(excluded.handwriting_heavy, document_recognition.handwriting_heavy),
      handwriting_confidence = coalesce(excluded.handwriting_confidence, document_recognition.handwriting_confidence),
      page_diagnostics = coalesce(excluded.page_diagnostics, document_recognition.page_diagnostics),
      page_count_detected = coalesce(excluded.page_count_detected, document_recognition.page_count_detected),
      updated_at = now()
    `, [
            documentId,
            text,
            pageTextsJson,
            ocrResult.detectedLanguage ?? null,
            ocrResult.possibleLanguages ? JSON.stringify(ocrResult.possibleLanguages) : null,
            ocrResult.ocrEngine ?? null,
            ocrResult.ocrConfidence ?? null,
            ocrResult.hasHandwriting ?? null,
            ocrResult.handwritingHeavy ?? null,
            ocrResult.handwritingConfidence ?? null,
            ocrResult.pageDiagnostics ? JSON.stringify(ocrResult.pageDiagnostics) : null,
            pages,
        ]);
    }
    catch (e) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: {
                status: "FAILED",
                failureStage: "recognition_save",
                failureReason: e?.message ?? "Recognition save failed",
                metaJson: { ...(doc.metaJson || {}), pipelineError: e?.message ?? "Recognition save failed", pipelineStage: "recognition_save" },
            },
        });
        await (0, errorLog_1.logSystemError)("worker", e, undefined, {
            firmId,
            area: "ocr",
            metaJson: { documentId, stage: "recognition_save" },
        });
        return;
    }
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: { status: "SCANNED", processedAt: new Date() },
    });
    try {
        const thumbKey = await (0, thumbnail_1.generateAndStoreDocumentThumbnail)(documentId, firmId, buf);
        if (thumbKey) {
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { thumbnailKey: thumbKey },
            });
        }
    }
    catch (thumbErr) {
        (0, logger_1.logWarn)("thumbnail_generation_skipped", {
            documentId,
            firmId,
            error: thumbErr instanceof Error ? thumbErr.message : String(thumbErr),
        });
    }
    await (0, queue_1.enqueueClassificationJob)({ documentId, firmId });
    (0, logger_1.logInfo)("ocr_done_queued_classification", { documentId, firmId });
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
    const onyx = (0, onyxClassifier_1.classifyOnyx)(text, doc.originalName ?? "");
    let legacyDocType = (0, onyxClassifier_1.onyxToLegacyDocType)(onyx.docType);
    const [insuranceOn, courtOn] = await Promise.all([
        (0, featureFlags_1.hasFeature)(firmId, "insurance_extraction"),
        (0, featureFlags_1.hasFeature)(firmId, "court_extraction"),
    ]);
    if ((legacyDocType === "insurance_letter" || legacyDocType.startsWith("insurance_")) && !insuranceOn)
        legacyDocType = "other";
    if ((legacyDocType === "court_filing" || legacyDocType.startsWith("court_")) && !courtOn)
        legacyDocType = "other";
    const extractedProvider = (0, providerExtraction_1.extractProviderFromText)(text);
    const matchedProvider = await (0, providerExtraction_1.matchProvider)(firmId, extractedProvider);
    if (!matchedProvider) {
        await (0, providerExtraction_1.createProviderSuggestion)(firmId, documentId, extractedProvider);
    }
    const normalizedHash = (0, duplicateDetection_1.computeNormalizedTextHash)(text);
    await pg_1.pgPool.query(`
    insert into document_recognition
    (document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, updated_at,
     classification_reason, classification_signals_json,
     provider_name, facility_name, provider_phone, provider_fax, provider_address, provider_specialty,
     suggested_provider_id, normalized_text_hash)
    values ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    on conflict (document_id) do update set
      text_excerpt = excluded.text_excerpt,
      doc_type = excluded.doc_type,
      client_name = excluded.client_name,
      case_number = excluded.case_number,
      incident_date = excluded.incident_date,
      confidence = excluded.confidence,
      classification_reason = excluded.classification_reason,
      classification_signals_json = excluded.classification_signals_json,
      provider_name = coalesce(excluded.provider_name, document_recognition.provider_name),
      facility_name = coalesce(excluded.facility_name, document_recognition.facility_name),
      provider_phone = coalesce(excluded.provider_phone, document_recognition.provider_phone),
      provider_fax = coalesce(excluded.provider_fax, document_recognition.provider_fax),
      provider_address = coalesce(excluded.provider_address, document_recognition.provider_address),
      provider_specialty = coalesce(excluded.provider_specialty, document_recognition.provider_specialty),
      suggested_provider_id = coalesce(excluded.suggested_provider_id, document_recognition.suggested_provider_id),
      normalized_text_hash = coalesce(excluded.normalized_text_hash, document_recognition.normalized_text_hash),
      updated_at = now()
    `, [
        documentId,
        text,
        legacyDocType,
        generic.clientName,
        generic.caseNumber,
        generic.incidentDate,
        onyx.confidence,
        onyx.reason,
        onyx.signals.length > 0 ? JSON.stringify(onyx.signals) : null,
        extractedProvider.providerName ?? extractedProvider.facilityName,
        extractedProvider.facilityName,
        extractedProvider.phone,
        extractedProvider.fax,
        extractedProvider.address,
        extractedProvider.specialty,
        matchedProvider?.providerId ?? null,
        normalizedHash,
    ]);
    const dupResult = await (0, duplicateDetection_1.findDuplicateCandidates)(firmId, documentId, text);
    if (doc.duplicateOfId) {
        // already marked as duplicate (e.g. ingest)
    }
    else if (dupResult.nearDuplicates.some((n) => n.confidence === "likely") || dupResult.original) {
        const duplicateOfId = dupResult.original?.id ??
            dupResult.nearDuplicates.find((n) => n.confidence === "likely" && n.documentId !== documentId)?.documentId ??
            null;
        if (duplicateOfId && duplicateOfId !== documentId) {
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { duplicateOfId, duplicateConfidence: dupResult.original ? 1 : 0.9 },
            });
        }
    }
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: { status: "CLASSIFIED" },
    });
    await (0, queue_1.enqueueExtractionJob)({ documentId, firmId });
    (0, logger_1.logInfo)("classification_done_queued_extraction", { documentId, firmId, docType: onyx.docType });
}
async function handleExtractionJob(documentId, firmId) {
    const doc = await prisma_1.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc)
        throw new Error(`Document not found: ${documentId}`);
    const { rows: recRows } = await pg_1.pgPool.query(`select text_excerpt, doc_type, client_name, case_number, incident_date, confidence, page_texts_json
     from document_recognition where document_id = $1`, [documentId]);
    const rec = recRows[0];
    if (!rec?.text_excerpt || !rec.doc_type)
        throw new Error(`Missing recognition data for ${documentId}`);
    const text = rec.text_excerpt;
    const finalDocType = rec.doc_type;
    const strictMode = await (0, extractionConfig_1.getExtractionStrictMode)(firmId);
    const confidenceThreshold = (0, extractionConfig_1.getConfidenceThreshold)();
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
    const extractedFieldsRaw = (0, extractors_1.runExtractors)(text, finalDocType, baseFields);
    let pageCandidates;
    try {
        const ptJson = rec.page_texts_json;
        if (ptJson && typeof ptJson === "string") {
            const arr = JSON.parse(ptJson);
            if (Array.isArray(arr) && arr.length > 1) {
                pageCandidates = arr.map(() => ({ clientName: rec.client_name, incidentDate: rec.incident_date }));
            }
        }
    }
    catch {
        // ignore
    }
    const consistency = (0, extractionConsistency_1.runConsistencyChecks)({
        clientName: rec.client_name,
        incidentDate: rec.incident_date,
        caseNumber: rec.case_number,
        pageCandidates,
    });
    const finalConfidenceRaw = rec.confidence ?? 0;
    const finalConfidence = consistency.loweredConfidence != null ? Math.min(finalConfidenceRaw, consistency.loweredConfidence) : finalConfidenceRaw;
    const extractedFields = (0, extractionEvidence_1.applyStrictModeToFlatFields)(extractedFieldsRaw, finalConfidence, strictMode, confidenceThreshold);
    if (consistency.conflicts?.length) {
        extractedFields.consistencyConflicts = consistency.conflicts;
        extractedFields.consistencyCandidates = consistency.candidates;
    }
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
    const normalizedHash = (0, duplicateDetection_1.computeNormalizedTextHash)(text);
    const providerName = insuranceFields && (finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_"))
        ? insuranceFields.insuranceCompany ??
            insuranceFields.adjusterName ??
            null
        : null;
    await pg_1.pgPool.query(`
    update document_recognition set
      insurance_fields = $1,
      court_fields = $2,
      risks = $3,
      insights = $4,
      summary = $5,
      normalized_text_hash = $6,
      text_fingerprint = $7,
      provider_name = $8,
      extraction_strict_mode = $9,
      updated_at = now()
    where document_id = $10
    `, [
        insuranceFieldsJson,
        courtFieldsJson,
        risksJson,
        insightsJson,
        summaryJson,
        normalizedHash,
        normalizedHash.slice(0, 64),
        providerName,
        strictMode,
        documentId,
    ]);
    if (insuranceFields?.settlementOffer != null && insuranceFields.settlementOffer > 0) {
        const caseId = doc.routedCaseId ?? null;
        (0, notifications_1.createNotification)(firmId, "settlement_offer_detected", "Settlement offer extracted", `A settlement offer of $${Number(insuranceFields.settlementOffer).toLocaleString()} was extracted from a document.`, { documentId, amount: insuranceFields.settlementOffer, ...(caseId ? { caseId } : {}) }).catch((e) => (0, logger_1.logWarn)("notification_settlement_offer_failed", { documentId, firmId, error: e?.message }));
        if (!finalDocType.startsWith("insurance_")) {
            const ym = yearMonth(new Date());
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
    }
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
    (0, logger_1.logInfo)("extraction_done_queued_case_match", { documentId, firmId });
}
async function handleCaseMatchJob(documentId, firmId) {
    const { rows } = await pg_1.pgPool.query(`select case_number, client_name from document_recognition where document_id = $1`, [documentId]);
    const rec = rows[0];
    const caseNumber = rec?.case_number ?? null;
    const clientName = rec?.client_name ?? null;
    const rule = await prisma_1.prisma.routingRule.findUnique({ where: { firmId } });
    const minAutoRouteConfidence = rule?.minAutoRouteConfidence ?? 0.9;
    const autoRouteEnabled = rule?.autoRouteEnabled ?? false;
    const doc = await prisma_1.prisma.document.findUnique({ where: { id: documentId }, select: { routedCaseId: true } });
    const match = await (0, caseMatching_1.matchDocumentToCase)(firmId, { caseNumber, clientName }, doc?.routedCaseId ?? null);
    let matchConfidence = match.matchConfidence;
    let matchedCaseId = match.caseId;
    let suggestedCaseId = matchedCaseId;
    // Auto-create case from unmatched doc when enabled and clientName extracted
    if (matchedCaseId == null &&
        clientName &&
        String(clientName).trim().length >= 2) {
        const firm = await prisma_1.prisma.firm.findUnique({
            where: { id: firmId },
            select: { settings: true },
        });
        const settings = firm?.settings ?? {};
        const autoCreate = settings.autoCreateCaseFromDoc === true;
        if (autoCreate) {
            const name = String(clientName).trim();
            const newCase = await prisma_1.prisma.legalCase.create({
                data: {
                    firmId,
                    title: name,
                    clientName: name,
                },
            });
            (0, webhooks_1.emitWebhookEvent)(firmId, "case.created", {
                caseId: newCase.id,
                title: name,
                clientName: name,
                source: "auto_create_from_doc",
            }).catch((e) => (0, logger_1.logWarn)("webhooks_case_created_failed", { firmId, caseId: newCase.id, error: e?.message }));
            matchedCaseId = newCase.id;
            suggestedCaseId = newCase.id;
            matchConfidence = 1;
            const routed = await (0, documentRouting_1.routeDocument)(firmId, documentId, newCase.id, {
                actor: "system",
                action: "auto_created_case",
                routedSystem: "auto",
                routingStatus: "routed",
                metaJson: { reason: "auto_create_from_doc", clientName: name },
            });
            if (routed.ok) {
                (0, notifications_1.createNotification)(firmId, "case_created_from_doc", "Case created from document", `A new case "${name}" was created from an unmatched document and the document was routed to it.`, { caseId: newCase.id, documentId, clientName: name }).catch((e) => (0, logger_1.logWarn)("notification_case_created_from_doc_failed", { documentId, firmId, caseId: newCase.id, error: e?.message }));
                (0, queue_1.enqueueTimelineRebuildJob)({ caseId: newCase.id, firmId }).catch((e) => (0, logger_1.logWarn)("enqueue_timeline_rebuild_failed", { documentId, firmId, caseId: newCase.id, error: e?.message }));
                await prisma_1.prisma.document.update({
                    where: { id: documentId },
                    data: { status: "ROUTED", processingStage: "complete" },
                });
                (0, webhooks_1.emitWebhookEvent)(firmId, "document.processed", {
                    documentId,
                    status: "ROUTED",
                    processingStage: "complete",
                    caseId: newCase.id,
                }).catch((e) => (0, logger_1.logWarn)("webhooks_document_processed_failed", { documentId, firmId, error: e?.message }));
                await pg_1.pgPool.query(`update document_recognition set match_confidence = 1, match_reason = $1, suggested_case_id = $3, unmatched_reason = null, updated_at = now() where document_id = $2`, ["Case auto-created from document", documentId, newCase.id]);
                (0, logger_1.logInfo)("case_auto_created_routed", { documentId, firmId, caseId: newCase.id });
                return;
            }
        }
    }
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
            (0, logger_1.logInfo)("case_match_auto_routed", { documentId, firmId, caseId: matchedCaseId, matchConfidence });
            (0, queue_1.enqueueTimelineRebuildJob)({ caseId: matchedCaseId, firmId }).catch((e) => (0, logger_1.logWarn)("enqueue_timeline_rebuild_failed", { documentId, firmId, caseId: matchedCaseId, error: e?.message }));
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { status: "ROUTED", processingStage: "complete" },
            });
            (0, webhooks_1.emitWebhookEvent)(firmId, "document.processed", {
                documentId,
                status: "ROUTED",
                processingStage: "complete",
                caseId: matchedCaseId,
            }).catch((e) => (0, logger_1.logWarn)("webhooks_document_processed_failed", { documentId, firmId, error: e?.message }));
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
            await (0, reviewQueueEvent_1.recordReviewQueueEnter)(firmId, documentId);
            (0, webhooks_1.emitWebhookEvent)(firmId, "document.processed", {
                documentId,
                status: "NEEDS_REVIEW",
                processingStage: "complete",
                suggestedCaseId: matchedCaseId,
            }).catch((e) => (0, logger_1.logWarn)("webhooks_document_processed_failed", { documentId, firmId, error: e?.message }));
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
        await (0, reviewQueueEvent_1.recordReviewQueueEnter)(firmId, documentId);
        (0, webhooks_1.emitWebhookEvent)(firmId, "document.processed", {
            documentId,
            status: "NEEDS_REVIEW",
            processingStage: "complete",
            suggestedCaseId: suggestedCaseId ?? undefined,
        }).catch((e) => (0, logger_1.logWarn)("webhooks_document_processed_failed", { documentId, firmId, error: e?.message }));
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
    await pg_1.pgPool.query(`update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, unmatched_reason = $5, updated_at = now() where document_id = $3`, [matchConfidence, match.matchReason ?? null, documentId, matchedCaseId, match.unmatchedReason ?? null]);
    if (matchedCaseId == null && match.matchConfidence === 0) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: { status: "UNMATCHED" },
        });
    }
    (0, logger_1.logInfo)("case_match_done", { documentId, firmId, suggestedCaseId: matchedCaseId ?? undefined });
}
async function run() {
    (0, logger_1.logInfo)("worker_started", { message: "Waiting for jobs (ocr, classification, extraction, case_match, timeline_rebuild)" });
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
                (0, logger_1.logWarn)("worker_invalid_job_payload", { jobType: job.type, hasDocumentId: !!documentId });
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
                    (0, logger_1.logWarn)("worker_unknown_job_type", { jobType, documentId, firmId });
            }
        }
        catch (err) {
            const documentId = "documentId" in job ? job.documentId : null;
            const firmId = job.firmId;
            const jobType = job.type ?? "unknown";
            const errMsg = err instanceof Error ? err.message : String(err);
            (0, logger_1.logError)("worker_job_error", { documentId, firmId, jobType, error: errMsg });
            if (documentId) {
                const failureStage = jobType === "ocr"
                    ? "ocr"
                    : jobType === "classification"
                        ? "classification"
                        : jobType === "extraction"
                            ? "extraction"
                            : jobType === "case_match"
                                ? "case_match"
                                : jobType === "timeline_rebuild"
                                    ? "timeline"
                                    : "unknown";
                try {
                    await prisma_1.prisma.document.update({
                        where: { id: documentId },
                        data: {
                            status: "FAILED",
                            failureStage,
                            failureReason: errMsg.slice(0, 2000),
                        },
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
    (0, logger_1.logError)("worker_fatal", { error: e instanceof Error ? e.message : String(e) });
    process.exit(1);
});
