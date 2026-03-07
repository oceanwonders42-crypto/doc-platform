import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import {
  popJob,
  enqueueClassificationJob,
  enqueueExtractionJob,
  enqueueCaseMatchJob,
  enqueueTimelineRebuildJob,
} from "../services/queue";
import { getObjectBuffer } from "../services/storage";
import { generateAndStoreDocumentThumbnail } from "../services/thumbnail";
import { countPagesFromBuffer } from "../services/pageCount";
import { runOcrPipeline } from "../services/ocr";
import { logOcrExtractionFailure } from "../services/ocrLogger";
import { logSystemError } from "../services/errorLog";
import { classifyAndExtract } from "../ai/docRecognition";
import { analyzeRisks } from "../ai/riskAnalyzer";
import { analyzeDocumentInsights } from "../ai/documentInsights";
import { summarizeDocument } from "../ai/documentSummary";
import { classify } from "../ai/docClassifier";
import { classifyOnyx, onyxToLegacyDocType } from "../ai/onyxClassifier";
import { logClassificationDecision } from "../services/classificationLogger";
import { renameDocumentInStorage } from "../services/smartRename";
import { logRoutingDecision } from "../services/routingLogger";
import { runExtractors } from "../ai/extractors";
import { extractInsuranceOfferFields } from "../ai/extractors/insuranceOfferExtractor";
import { extractCourtFields } from "../ai/extractors/courtExtractor";
import { extractGrowthFields } from "../ai/extractors/growthExtraction";
import { matchDocumentToCase } from "../services/caseMatching";
import { routeDocument } from "../services/documentRouting";
import { recordReviewQueueEnter } from "../services/reviewQueueEvent";
import { getExtractionStrictMode, getConfidenceThreshold } from "../services/extractionConfig";
import { applyStrictModeToFlatFields } from "../services/extractionEvidence";
import { runConsistencyChecks } from "../services/extractionConsistency";
import { hasFeature } from "../services/featureFlags";
import { getEffectiveMinAutoRouteConfidence, getWorkflowConfig } from "../services/premiumWorkflowConfig";
import { rebuildCaseTimeline } from "../services/caseTimeline";
import { pushCaseIntelligenceToCrm } from "../integrations/crm/pushService";
import { createNotification } from "../services/notifications";
import { emitWebhookEvent } from "../services/webhooks";
import { computeNormalizedTextHash, findDuplicateCandidates } from "../services/duplicateDetection";
import { extractProviderFromText, extractProviderCandidateFromText, isProviderCandidateConfident, createProviderSuggestion } from "../services/providerExtraction";
import { resolveProvider } from "../services/providerNormalization";
import { logInfo, logWarn, logError } from "../lib/logger";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function yearMonth(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Below this length we treat OCR output as unreadable / low-quality and flag for review */
const MIN_TEXT_UNREADABLE = 20;

async function handleTimelineRebuild(caseId: string, firmId: string): Promise<void> {
  logInfo("timeline_rebuild_start", { caseId, firmId });
  await rebuildCaseTimeline(caseId, firmId);
  logInfo("timeline_rebuild_done", { caseId, firmId });
  pushCaseIntelligenceToCrm({ firmId, caseId, actionType: "timeline_rebuilt" }).catch((e) =>
    logWarn("crm_push_after_timeline_rebuilt_failed", { caseId, firmId, error: (e as Error)?.message })
  );
}

async function handleOcrJob(documentId: string, firmId: string): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: "PROCESSING",
      processingStage: "uploaded",
      failureStage: null,
      failureReason: null,
    },
  });

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  if (doc.duplicateOfId) {
    logInfo("ocr_skipped_duplicate", { documentId, firmId, duplicateOfId: doc.duplicateOfId });
    return;
  }

  let buf: Buffer;
  try {
    buf = await getObjectBuffer(doc.spacesKey);
  } catch (e) {
    logOcrExtractionFailure({
      stage: "fetch",
      message: (e as Error)?.message ?? "Failed to load file",
      documentId,
      firmId,
      severity: "error",
    });
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "FAILED",
        failureStage: "fetch",
        failureReason: (e as Error)?.message ?? "Failed to load file",
        metaJson: (doc.metaJson as Record<string, unknown>) || {}
          ? { ...(doc.metaJson as Record<string, unknown>), pipelineError: (e as Error)?.message ?? "Failed to load file", pipelineStage: "fetch" }
          : { pipelineError: (e as Error)?.message ?? "Failed to load file", pipelineStage: "fetch" },
      },
    });
    await logSystemError("worker", e as Error, undefined, {
      firmId,
      area: "ocr",
      metaJson: { documentId, stage: "fetch" },
    });
    return;
  }

  let pages: number;
  try {
    pages = await countPagesFromBuffer(buf, doc.mimeType, doc.originalName);
  } catch (e) {
    const msg = (e as Error)?.message ?? "Page count failed";
    logOcrExtractionFailure({
      stage: "page_count",
      message: msg,
      documentId,
      firmId,
      severity: "error",
    });
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "FAILED",
        failureStage: "page_count",
        failureReason: msg,
        metaJson: { ...((doc.metaJson as Record<string, unknown>) || {}), pipelineError: msg, pipelineStage: "page_count" },
      },
    });
    await logSystemError("worker", e as Error, undefined, {
      firmId,
      area: "ocr",
      metaJson: { documentId, stage: "page_count" },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
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

  const isPdf =
    doc.mimeType === "application/pdf" || (doc.originalName || "").toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStage: "complete" },
    });
    emitWebhookEvent(firmId, "document.processed", {
      documentId,
      status: "UPLOADED",
      pageCount: pages,
      processingStage: "complete",
    }).catch((e) => logWarn("webhook_document_processed_failed", { documentId, firmId, error: (e as Error)?.message }));
    logInfo("document_done_non_pdf", { documentId, firmId, pages });
    return;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { processingStage: "ocr" },
  });

  let ocrResult;
  try {
    ocrResult = await runOcrPipeline(buf, {
      documentId,
      firmId,
      onOcrFailure: ({ stage, message }) => {
        logOcrExtractionFailure({
          stage: stage as import("../services/ocrLogger").OcrExtractionStage,
          message,
          documentId,
          firmId,
          pageCount: pages,
          severity: "warn",
        });
        logSystemError("worker", message, undefined, {
          firmId,
          area: "ocr",
          metaJson: { documentId, stage },
        }).catch(() => {});
      },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "OCR failed";
    logOcrExtractionFailure({
      stage: "ocr",
      message: msg,
      documentId,
      firmId,
      pageCount: pages,
      severity: "error",
    });
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "FAILED",
        failureStage: "ocr",
        failureReason: msg,
        metaJson: { ...((doc.metaJson as Record<string, unknown>) || {}), pipelineError: msg, pipelineStage: "ocr" },
      },
    });
    await logSystemError("worker", e as Error, undefined, {
      firmId,
      area: "ocr",
      metaJson: { documentId, stage: "ocr" },
    });
    return;
  }

  const text = ocrResult.fullText;
  const textLength = (text || "").trim().length;
  const lowQuality =
    textLength < MIN_TEXT_UNREADABLE || ocrResult.lowQualityExtraction === true;
  if (lowQuality) {
    logOcrExtractionFailure({
      stage: "low_text",
      message:
        textLength === 0
          ? "No text extracted (scanned/image-only or unreadable); document flagged for review"
          : `Low text extracted (${textLength} chars); document flagged for review`,
      documentId,
      firmId,
      pageCount: pages,
      textLength,
      ocrEngine: ocrResult.ocrEngine,
      severity: "info",
    });
  }

  const pageTextsJson =
    ocrResult.pageTexts.length > 0
      ? JSON.stringify(ocrResult.pageTexts.map((p) => ({ page: p.page, text: p.text })))
      : null;

  try {
    await pgPool.query(
      `
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
    `,
      [
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
      ]
    );
  } catch (e) {
    const msg = (e as Error)?.message ?? "Recognition save failed";
    logOcrExtractionFailure({
      stage: "recognition_save",
      message: msg,
      documentId,
      firmId,
      textLength,
      severity: "error",
    });
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "FAILED",
        failureStage: "recognition_save",
        failureReason: msg,
        metaJson: { ...((doc.metaJson as Record<string, unknown>) || {}), pipelineError: msg, pipelineStage: "recognition_save" },
      },
    });
    await logSystemError("worker", e as Error, undefined, {
      firmId,
      area: "ocr",
      metaJson: { documentId, stage: "recognition_save" },
    });
    return;
  }

  const metaJsonUpdate: Record<string, unknown> = (doc.metaJson as Record<string, unknown>) || {};
  if (lowQuality) metaJsonUpdate.extractionQuality = textLength === 0 ? "unreadable" : "low";

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: "SCANNED",
      processedAt: new Date(),
      ...(Object.keys(metaJsonUpdate).length > 0 ? { metaJson: metaJsonUpdate } : {}),
    },
  });

  try {
    const thumbKey = await generateAndStoreDocumentThumbnail(documentId, firmId, buf);
    if (thumbKey) {
      await prisma.document.update({
        where: { id: documentId },
        data: { thumbnailKey: thumbKey },
      });
    }
  } catch (thumbErr) {
    logWarn("thumbnail_generation_skipped", {
      documentId,
      firmId,
      error: thumbErr instanceof Error ? thumbErr.message : String(thumbErr),
    });
  }

  await enqueueClassificationJob({ documentId, firmId });
  logInfo("ocr_done_queued_classification", { documentId, firmId });
}

async function handleClassificationJob(documentId: string, firmId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const { rows } = await pgPool.query<{ text_excerpt: string | null }>(
    `select text_excerpt from document_recognition where document_id = $1`,
    [documentId]
  );
  const text = rows[0]?.text_excerpt ?? "";
  const textTrimmed = (text || "").trim();
  const hasMinimalText = textTrimmed.length >= 2;

  if (!hasMinimalText) {
    logOcrExtractionFailure({
      stage: "classification",
      message: "No or minimal text for classification; using doc_type other and continuing pipeline",
      documentId,
      firmId,
      textLength: textTrimmed.length,
      severity: "info",
    });
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { processingStage: "classification" },
  });

  const generic = classifyAndExtract(text);
  const onyx = classifyOnyx(text, doc.originalName ?? "");
  let legacyDocType: string;
  let classificationStatus: "confirmed" | "uncertain" | "fallback";
  let suggestedDocType: string | null = null;
  let classificationConfidence: number;

  if (!hasMinimalText) {
    legacyDocType = "other";
    classificationStatus = "fallback";
    classificationConfidence = 0;
  } else if (onyx.classificationStatus === "fallback" || onyx.classificationStatus === "uncertain") {
    legacyDocType = "other";
    suggestedDocType = onyxToLegacyDocType(onyx.docType);
    classificationStatus = onyx.classificationStatus;
    classificationConfidence = onyx.confidence;
  } else {
    legacyDocType = onyxToLegacyDocType(onyx.docType);
    classificationStatus = "confirmed";
    classificationConfidence = onyx.confidence;
  }

  const [insuranceOn, courtOn] = await Promise.all([
    hasFeature(firmId, "insurance_extraction"),
    hasFeature(firmId, "court_extraction"),
  ]);
  if ((legacyDocType === "insurance_letter" || legacyDocType.startsWith("insurance_")) && !insuranceOn) legacyDocType = "other";
  if ((legacyDocType === "court_filing" || legacyDocType.startsWith("court_")) && !courtOn) legacyDocType = "other";

  logClassificationDecision({
    documentId,
    firmId,
    docType: legacyDocType,
    suggestedDocType: suggestedDocType ?? undefined,
    confidence: classificationConfidence,
    status: classificationStatus,
    reason: onyx.reason,
    signalCount: onyx.signals.length,
  });

  const extractedProvider = extractProviderFromText(text);
  const providerCandidate = extractProviderCandidateFromText(text, legacyDocType);
  const providerNameForRec =
    isProviderCandidateConfident(providerCandidate) && (providerCandidate.name || providerCandidate.facility)
      ? (providerCandidate.name ?? providerCandidate.facility)
      : null;
  const resolution = await resolveProvider(firmId, providerNameForRec);
  if (!resolution.resolved && providerNameForRec) {
    await createProviderSuggestion(firmId, documentId, extractedProvider);
  }

  const normalizedHash = computeNormalizedTextHash(text);
  const suggestedProviderId = resolution.resolved ? resolution.providerId : null;
  const providerResolutionStatus = providerNameForRec ? (resolution.resolved ? "resolved" : "unresolved") : null;
  const providerNameNormalized = resolution.resolved ? resolution.normalizedName : (resolution.normalizedName || null);

  await pgPool.query(
    `
    insert into document_recognition
    (document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, updated_at,
     classification_reason, classification_signals_json,
     provider_name, provider_name_normalized, provider_resolution_status, facility_name, provider_phone, provider_fax, provider_address, provider_specialty,
     suggested_provider_id, normalized_text_hash, classification_status, suggested_doc_type)
    values ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    on conflict (document_id) do update set
      text_excerpt = excluded.text_excerpt,
      doc_type = excluded.doc_type,
      client_name = excluded.client_name,
      case_number = excluded.case_number,
      incident_date = excluded.incident_date,
      confidence = excluded.confidence,
      classification_reason = excluded.classification_reason,
      classification_signals_json = excluded.classification_signals_json,
      classification_status = excluded.classification_status,
      suggested_doc_type = excluded.suggested_doc_type,
      provider_name = coalesce(excluded.provider_name, document_recognition.provider_name),
      provider_name_normalized = coalesce(excluded.provider_name_normalized, document_recognition.provider_name_normalized),
      provider_resolution_status = coalesce(excluded.provider_resolution_status, document_recognition.provider_resolution_status),
      facility_name = coalesce(excluded.facility_name, document_recognition.facility_name),
      provider_phone = coalesce(excluded.provider_phone, document_recognition.provider_phone),
      provider_fax = coalesce(excluded.provider_fax, document_recognition.provider_fax),
      provider_address = coalesce(excluded.provider_address, document_recognition.provider_address),
      provider_specialty = coalesce(excluded.provider_specialty, document_recognition.provider_specialty),
      suggested_provider_id = coalesce(excluded.suggested_provider_id, document_recognition.suggested_provider_id),
      normalized_text_hash = coalesce(excluded.normalized_text_hash, document_recognition.normalized_text_hash),
      updated_at = now()
    `,
    [
      documentId,
      text,
      legacyDocType,
      generic.clientName,
      generic.caseNumber,
      generic.incidentDate,
      classificationConfidence,
      onyx.reason,
      onyx.signals.length > 0 ? JSON.stringify(onyx.signals) : null,
      providerNameForRec,
      providerNameNormalized,
      providerResolutionStatus,
      extractedProvider.facilityName,
      extractedProvider.phone,
      extractedProvider.fax,
      extractedProvider.address,
      extractedProvider.specialty,
      suggestedProviderId,
      normalizedHash,
      classificationStatus,
      suggestedDocType,
    ]
  );

  const dupResult = await findDuplicateCandidates(firmId, documentId, text);
  if (doc.duplicateOfId) {
    // already marked as duplicate (e.g. ingest)
  } else if (dupResult.nearDuplicates.some((n) => n.confidence === "likely") || dupResult.original) {
    const duplicateOfId =
      dupResult.original?.id ??
      dupResult.nearDuplicates.find((n) => n.confidence === "likely" && n.documentId !== documentId)?.documentId ??
      null;
    if (duplicateOfId && duplicateOfId !== documentId) {
      await prisma.document.update({
        where: { id: documentId },
        data: { duplicateOfId, duplicateConfidence: dupResult.original ? 1 : 0.9 },
      });
    }
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: "CLASSIFIED",
      metaJson: {
        ...((doc.metaJson as Record<string, unknown>) || {}),
        providerCandidate:
          providerCandidate.name || providerCandidate.facility
            ? {
                name: providerCandidate.name,
                facility: providerCandidate.facility,
                confidence: providerCandidate.confidence,
                source: providerCandidate.source,
              }
            : undefined,
      },
    },
  });

  await renameDocumentInStorage(documentId, firmId).catch((e) => {
    logWarn("smart_rename_after_classification_failed", {
      documentId,
      firmId,
      error: e instanceof Error ? e.message : String(e),
    });
  });

  await enqueueExtractionJob({ documentId, firmId });
  logInfo("classification_done_queued_extraction", { documentId, firmId, docType: onyx.docType });
}

async function handleExtractionJob(documentId: string, firmId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const { rows: recRows } = await pgPool.query<{
    text_excerpt: string | null;
    doc_type: string | null;
    client_name: string | null;
    case_number: string | null;
    incident_date: string | null;
    confidence: number | null;
    page_texts_json: string | null;
    provider_name: string | null;
    facility_name?: string | null;
    provider_phone?: string | null;
    provider_fax?: string | null;
    provider_address?: string | null;
    provider_specialty?: string | null;
  }>(
    `select text_excerpt, doc_type, client_name, case_number, incident_date, confidence, page_texts_json, provider_name,
     facility_name, provider_phone, provider_fax, provider_address, provider_specialty
     from document_recognition where document_id = $1`,
    [documentId]
  );
  const rec = recRows[0];
  if (!rec) throw new Error(`Missing recognition row for ${documentId}`);
  const text = rec.text_excerpt ?? "";
  const finalDocType = rec.doc_type ?? "other";
  const hasMinimalText = text.trim().length >= 2;

  if (!hasMinimalText) {
    logOcrExtractionFailure({
      stage: "extraction",
      message: "No or minimal text for extraction; saving minimal data and marking for review",
      documentId,
      firmId,
      textLength: text.trim().length,
      severity: "info",
    });
  }

  const strictMode = await getExtractionStrictMode(firmId);
  const confidenceThreshold = getConfidenceThreshold();

  await prisma.document.update({
    where: { id: documentId },
    data: { processingStage: "extraction" },
  });

  const baseFields: Record<string, unknown> = {
    docType: finalDocType,
    caseNumber: rec.case_number,
    clientName: rec.client_name,
    incidentDate: rec.incident_date,
    excerptLength: text.length,
  };
  const extractedFieldsRaw = runExtractors(text, finalDocType, baseFields);

  let pageCandidates: { clientName?: string | null; incidentDate?: string | null }[] | undefined;
  try {
    const ptJson = rec.page_texts_json;
    if (ptJson && typeof ptJson === "string") {
      const arr = JSON.parse(ptJson) as { page?: number; text?: string }[];
      if (Array.isArray(arr) && arr.length > 1) {
        pageCandidates = arr.map(() => ({ clientName: rec.client_name, incidentDate: rec.incident_date }));
      }
    }
  } catch {
    // ignore
  }
  const consistency = runConsistencyChecks({
    clientName: rec.client_name,
    incidentDate: rec.incident_date,
    caseNumber: rec.case_number,
    pageCandidates,
  });
  const finalConfidenceRaw = rec.confidence ?? 0;
  const finalConfidence = consistency.loweredConfidence != null ? Math.min(finalConfidenceRaw, consistency.loweredConfidence) : finalConfidenceRaw;
  const extractedFields = applyStrictModeToFlatFields(
    extractedFieldsRaw,
    finalConfidence,
    strictMode,
    confidenceThreshold
  );
  if (consistency.conflicts?.length) {
    (extractedFields as Record<string, unknown>).consistencyConflicts = consistency.conflicts;
    (extractedFields as Record<string, unknown>).consistencyCandidates = consistency.candidates;
  }

  const growthOn = await hasFeature(firmId, "growth_extraction");
  if (growthOn) {
    const growth = extractGrowthFields(
      text,
      finalDocType,
      {
        medicalRecord: (extractedFieldsRaw.medicalRecord ?? null) as import("../ai/extractors/medicalRecord").MedicalRecordExtracted | null,
        insurance: (extractedFieldsRaw.insurance ?? null) as import("../ai/extractors/insurance").InsuranceExtracted | null,
        court: (extractedFieldsRaw.court ?? null) as import("../ai/extractors/court").CourtExtracted | null,
        incidentDate: rec.incident_date ?? undefined,
        caseNumber: rec.case_number ?? undefined,
        clientName: rec.client_name ?? undefined,
      },
      {
        incident_date: rec.incident_date,
        provider_name: rec.provider_name,
        facility_name: rec.facility_name ?? null,
        provider_phone: rec.provider_phone ?? null,
        provider_fax: rec.provider_fax ?? null,
        provider_address: rec.provider_address ?? null,
        provider_specialty: rec.provider_specialty ?? null,
      }
    );
    (extractedFields as Record<string, unknown>).growthExtraction = growth;
  }

  const [insuranceOn, courtOn] = await Promise.all([
    hasFeature(firmId, "insurance_extraction"),
    hasFeature(firmId, "court_extraction"),
  ]);
  let insuranceFields: import("../ai/extractors/insuranceOfferExtractor").InsuranceOfferFields | null = null;
  if (insuranceOn && finalDocType.startsWith("insurance_")) {
    insuranceFields = await extractInsuranceOfferFields({ text, fileName: doc.originalName ?? undefined });
  }
  const insuranceFieldsJson = insuranceFields ? JSON.stringify(insuranceFields) : null;
  const courtFieldsJson =
    courtOn && finalDocType.startsWith("court_")
      ? JSON.stringify(await extractCourtFields({ text, fileName: doc.originalName ?? undefined }))
      : null;

  const { risks } = analyzeRisks(text);
  const risksJson = risks.length > 0 ? JSON.stringify(risks) : null;
  const { insights } = analyzeDocumentInsights(text);
  const insightsJson = insights.length > 0 ? JSON.stringify(insights) : null;
  const { summary: summaryText, keyFacts } = await summarizeDocument(text);
  const summaryJson =
    summaryText || keyFacts.length > 0 ? JSON.stringify({ summary: summaryText, keyFacts }) : null;

  const normalizedHash = computeNormalizedTextHash(text);
  let providerNameForUpdate: string | null;
  let providerCandidateForMeta: { name: string | null; facility: string | null; confidence: string; source: string } | undefined;

  if (insuranceFields && (finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_"))) {
    providerNameForUpdate =
      (insuranceFields as { insuranceCompany?: string; adjusterName?: string }).insuranceCompany ??
      (insuranceFields as { insuranceCompany?: string; adjusterName?: string }).adjusterName ??
      null;
  } else {
    const providerCandidate = extractProviderCandidateFromText(text, finalDocType);
    const medical = (extractedFieldsRaw.medicalRecord ?? {}) as { provider?: string | null; facility?: string | null };
    let name = providerCandidate.name;
    let facility = providerCandidate.facility;
    let confidence = providerCandidate.confidence;
    if (medical.provider?.trim() || medical.facility?.trim()) {
      if (!name && medical.provider?.trim()) {
        name = medical.provider.trim().slice(0, 200);
        if (confidence === "low") confidence = "medium";
      }
      if (!facility && medical.facility?.trim()) facility = medical.facility.trim().slice(0, 200);
    }
    const mergedCandidate = { ...providerCandidate, name: name ?? null, facility: facility ?? null, confidence };
    providerCandidateForMeta =
      mergedCandidate.name || mergedCandidate.facility
        ? { name: mergedCandidate.name, facility: mergedCandidate.facility, confidence: mergedCandidate.confidence, source: mergedCandidate.source }
        : undefined;
    providerNameForUpdate =
      isProviderCandidateConfident(mergedCandidate) && (mergedCandidate.name || mergedCandidate.facility)
        ? (mergedCandidate.name ?? mergedCandidate.facility)
        : (rec as { provider_name?: string | null }).provider_name ?? null;
  }

  let providerNameNormalized: string | null = null;
  let providerResolutionStatus: string | null = null;
  let suggestedProviderId: string | null = null;
  if (providerNameForUpdate) {
    const resolution = await resolveProvider(firmId, providerNameForUpdate);
    providerNameNormalized = resolution.normalizedName || null;
    providerResolutionStatus = resolution.resolved ? "resolved" : "unresolved";
    suggestedProviderId = resolution.resolved ? resolution.providerId : null;
  }

  await pgPool.query(
    `
    update document_recognition set
      insurance_fields = $1,
      court_fields = $2,
      risks = $3,
      insights = $4,
      summary = $5,
      normalized_text_hash = $6,
      text_fingerprint = $7,
      provider_name = $8,
      provider_name_normalized = $9,
      provider_resolution_status = $10,
      suggested_provider_id = $11,
      extraction_strict_mode = $12,
      updated_at = now()
    where document_id = $13
    `,
    [
      insuranceFieldsJson,
      courtFieldsJson,
      risksJson,
      insightsJson,
      summaryJson,
      normalizedHash,
      normalizedHash.slice(0, 64),
      providerNameForUpdate,
      providerNameNormalized,
      providerResolutionStatus,
      suggestedProviderId,
      strictMode,
      documentId,
    ]
  );

  const metaUpdate: Record<string, unknown> = { ...((doc.metaJson as Record<string, unknown>) || {}) };
  if (providerCandidateForMeta) metaUpdate.providerCandidate = providerCandidateForMeta;
  const hasMetaUpdate = providerCandidateForMeta != null;

  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractedFields: extractedFields as Prisma.InputJsonValue,
      confidence: finalConfidence,
      processingStage: "case_match",
      ...(!hasMinimalText
        ? { metaJson: { ...metaUpdate, extractionQuality: "low" } }
        : hasMetaUpdate
          ? { metaJson: metaUpdate }
          : {}),
    },
  });

  if (insuranceFields?.settlementOffer != null && insuranceFields.settlementOffer > 0) {
    const caseId = doc.routedCaseId ?? null;
    createNotification(
      firmId,
      "settlement_offer_detected",
      "Settlement offer extracted",
      `A settlement offer of $${Number(insuranceFields.settlementOffer).toLocaleString()} was extracted from a document.`,
      { documentId, amount: insuranceFields.settlementOffer, ...(caseId ? { caseId } : {}) }
    ).catch((e) => logWarn("notification_settlement_offer_failed", { documentId, firmId, error: (e as Error)?.message }));
    if (!finalDocType.startsWith("insurance_")) {
      const ym = yearMonth(new Date());
      await prisma.usageMonthly.upsert({
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

  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractedFields: extractedFields as Prisma.InputJsonValue,
      confidence: finalConfidence,
      processingStage: "case_match",
      ...(!hasMinimalText
        ? { metaJson: { ...((doc.metaJson as Record<string, unknown>) || {}), extractionQuality: "low" } }
        : {}),
    },
  });

  const ym = yearMonth(new Date());
  if (finalDocType.startsWith("insurance_")) {
    await prisma.usageMonthly.upsert({
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
    await prisma.usageMonthly.upsert({
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

  await enqueueCaseMatchJob({ documentId, firmId });
  logInfo("extraction_done_queued_case_match", { documentId, firmId });
}

async function handleCaseMatchJob(documentId: string, firmId: string): Promise<void> {
  const { rows } = await pgPool.query<{
    case_number: string | null;
    client_name: string | null;
    doc_type: string | null;
  }>(
    `select case_number, client_name, doc_type from document_recognition where document_id = $1`,
    [documentId]
  );
  const rec = rows[0];
  const caseNumber = rec?.case_number ?? null;
  const clientName = rec?.client_name ?? null;
  const docType = rec?.doc_type ?? null;

  const rule = await prisma.routingRule.findUnique({ where: { firmId } });
  let minAutoRouteConfidence = rule?.minAutoRouteConfidence ?? 0.9;
  const premiumOverride = await getEffectiveMinAutoRouteConfidence(firmId);
  if (premiumOverride != null) minAutoRouteConfidence = premiumOverride;
  const autoRouteEnabled = rule?.autoRouteEnabled ?? false;

  const premiumConfig = await getWorkflowConfig(firmId);
  const excludeDocTypes = premiumConfig?.autoRouteExcludeDocTypes;
  const excludedFromAutoRoute =
    Array.isArray(excludeDocTypes) &&
    excludeDocTypes.length > 0 &&
    docType != null &&
    excludeDocTypes.some((t) => String(t).toLowerCase().trim() === String(docType).toLowerCase().trim());

  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { routedCaseId: true } });
  const match = await matchDocumentToCase(firmId, { caseNumber, clientName }, doc?.routedCaseId ?? null);
  let matchConfidence = match.matchConfidence;
  let matchedCaseId = match.caseId;
  let suggestedCaseId = matchedCaseId;

  const existingRoutedCaseId = doc?.routedCaseId ?? null;
  const preserveManualRoute =
    existingRoutedCaseId != null &&
    match.caseId != null &&
    existingRoutedCaseId !== match.caseId;
  if (preserveManualRoute) {
    logRoutingDecision({
      documentId,
      firmId,
      matchConfidence: match.matchConfidence,
      threshold: minAutoRouteConfidence,
      action: "needs_review",
      suggestedCaseId: match.caseId,
      matchedCaseId: existingRoutedCaseId,
      matchReason: match.matchReason,
      matchSource: match.matchSource,
      preservedManualRoute: true,
    });
    await pgPool.query(
      `update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, unmatched_reason = $5, updated_at = now() where document_id = $3`,
      [match.matchConfidence, match.matchReason ?? null, documentId, match.caseId, "Manual route preserved; system suggested different case"]
    );
    logInfo("case_match_done_preserved_manual_route", { documentId, firmId, existingCaseId: existingRoutedCaseId, suggestedCaseId: match.caseId });
    return;
  }

  // Auto-create case from unmatched doc when enabled and clientName extracted
  if (
    matchedCaseId == null &&
    clientName &&
    String(clientName).trim().length >= 2
  ) {
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    });
    const settings = (firm?.settings as Record<string, unknown>) ?? {};
    const autoCreate = settings.autoCreateCaseFromDoc === true;
    if (autoCreate) {
      const name = String(clientName).trim();
      const newCase = await prisma.legalCase.create({
        data: {
          firmId,
          title: name,
          clientName: name,
        },
      });
      emitWebhookEvent(firmId, "case.created", {
        caseId: newCase.id,
        title: name,
        clientName: name,
        source: "auto_create_from_doc",
      }).catch((e) => logWarn("webhooks_case_created_failed", { firmId, caseId: newCase.id, error: (e as Error)?.message }));
      matchedCaseId = newCase.id;
      suggestedCaseId = newCase.id;
      matchConfidence = 1;
      const routed = await routeDocument(firmId, documentId, newCase.id, {
        actor: "system",
        action: "auto_created_case",
        routedSystem: "auto",
        routingStatus: "routed",
        metaJson: { reason: "auto_create_from_doc", clientName: name },
      });
      if (routed.ok) {
        createNotification(
          firmId,
          "case_created_from_doc",
          "Case created from document",
          `A new case "${name}" was created from an unmatched document and the document was routed to it.`,
          { caseId: newCase.id, documentId, clientName: name }
        ).catch((e) => logWarn("notification_case_created_from_doc_failed", { documentId, firmId, caseId: newCase.id, error: (e as Error)?.message }));
        enqueueTimelineRebuildJob({ caseId: newCase.id, firmId }).catch((e) =>
          logWarn("enqueue_timeline_rebuild_failed", { documentId, firmId, caseId: newCase.id, error: (e as Error)?.message })
        );
        await prisma.document.update({
          where: { id: documentId },
          data: { status: "ROUTED", processingStage: "complete" },
        });
        emitWebhookEvent(firmId, "document.processed", {
          documentId,
          status: "ROUTED",
          processingStage: "complete",
          caseId: newCase.id,
        }).catch((e) => logWarn("webhooks_document_processed_failed", { documentId, firmId, error: (e as Error)?.message }));
        await pgPool.query(
          `update document_recognition set match_confidence = 1, match_reason = $1, suggested_case_id = $3, unmatched_reason = null, updated_at = now() where document_id = $2`,
          ["Case auto-created from document", documentId, newCase.id]
        );
        logInfo("case_auto_created_routed", { documentId, firmId, caseId: newCase.id });
        return;
      }
    }
  }

  if (
    autoRouteEnabled &&
    !excludedFromAutoRoute &&
    suggestedCaseId != null &&
    matchedCaseId != null &&
    matchConfidence >= minAutoRouteConfidence
  ) {
    logRoutingDecision({
      documentId,
      firmId,
      matchConfidence,
      threshold: minAutoRouteConfidence,
      action: "auto_routed",
      suggestedCaseId: matchedCaseId,
      matchedCaseId,
      matchReason: match.matchReason,
      matchSource: match.matchSource,
    });
    const routed = await routeDocument(firmId, documentId, matchedCaseId, {
      actor: "system",
      action: "auto_routed",
      routedSystem: "auto",
      routingStatus: "routed",
      metaJson: { matchConfidence, caseId: matchedCaseId, matchReason: match.matchReason, matchSource: match.matchSource },
    });
    if (routed.ok) {
      logInfo("case_match_auto_routed", { documentId, firmId, caseId: matchedCaseId, matchConfidence });
      enqueueTimelineRebuildJob({ caseId: matchedCaseId, firmId }).catch((e) =>
        logWarn("enqueue_timeline_rebuild_failed", { documentId, firmId, caseId: matchedCaseId, error: (e as Error)?.message })
      );
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "ROUTED", processingStage: "complete" },
      });
      emitWebhookEvent(firmId, "document.processed", {
        documentId,
        status: "ROUTED",
        processingStage: "complete",
        caseId: matchedCaseId,
      }).catch((e) => logWarn("webhooks_document_processed_failed", { documentId, firmId, error: (e as Error)?.message }));
    } else {
      logRoutingDecision({
        documentId,
        firmId,
        matchConfidence,
        threshold: minAutoRouteConfidence,
        action: "needs_review",
        suggestedCaseId: matchedCaseId,
        matchReason: match.matchReason,
        unmatchedReason: routed.error,
      });
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "NEEDS_REVIEW",
          routingStatus: "needs_review",
          processingStage: "complete",
        },
      });
      await recordReviewQueueEnter(firmId, documentId);
      emitWebhookEvent(firmId, "document.processed", {
        documentId,
        status: "NEEDS_REVIEW",
        processingStage: "complete",
        suggestedCaseId: matchedCaseId,
      }).catch((e) => logWarn("webhooks_document_processed_failed", { documentId, firmId, error: (e as Error)?.message }));
      await prisma.documentAuditEvent.create({
        data: {
          firmId,
          documentId,
          actor: "system",
          action: "suggested",
          fromCaseId: null,
          toCaseId: matchedCaseId,
          metaJson: { matchConfidence, reason: routed.error, matchReason: match.matchReason, matchSource: match.matchSource },
        },
      });
    }
  } else {
    logRoutingDecision({
      documentId,
      firmId,
      matchConfidence,
      threshold: minAutoRouteConfidence,
      action: suggestedCaseId != null ? "needs_review" : "unmatched",
      suggestedCaseId,
      matchedCaseId,
      matchReason: match.matchReason,
      unmatchedReason: match.unmatchedReason,
      matchSource: match.matchSource,
    });
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "NEEDS_REVIEW",
        routingStatus: suggestedCaseId != null ? "needs_review" : null,
        processingStage: "complete",
      },
    });
    await recordReviewQueueEnter(firmId, documentId);
    emitWebhookEvent(firmId, "document.processed", {
      documentId,
      status: "NEEDS_REVIEW",
      processingStage: "complete",
      suggestedCaseId: suggestedCaseId ?? undefined,
    }).catch((e) => logWarn("webhooks_document_processed_failed", { documentId, firmId, error: (e as Error)?.message }));
    if (suggestedCaseId != null) {
      await prisma.documentAuditEvent.create({
        data: {
          firmId,
          documentId,
          actor: "system",
          action: "suggested",
          fromCaseId: null,
          toCaseId: matchedCaseId ?? null,
          metaJson: { matchConfidence, suggestedCaseId, matchReason: match.matchReason, matchSource: match.matchSource },
        },
      });
    }
  }

  await pgPool.query(
    `update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, unmatched_reason = $5, updated_at = now() where document_id = $3`,
    [matchConfidence, match.matchReason ?? null, documentId, matchedCaseId, match.unmatchedReason ?? null]
  );

  if (matchedCaseId == null && match.matchConfidence === 0) {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "UNMATCHED" },
    });
  }

  logInfo("case_match_done", { documentId, firmId, suggestedCaseId: matchedCaseId ?? undefined });
}

async function run(): Promise<void> {
  logInfo("worker_started", { message: "Waiting for jobs (ocr, classification, extraction, case_match, timeline_rebuild)" });

  while (true) {
    const job = await popJob();

    if (!job) {
      await sleep(500);
      continue;
    }

    try {
      if (job.type === "timeline_rebuild") {
        await handleTimelineRebuild(job.caseId, job.firmId);
        continue;
      }

      const documentId = "documentId" in job ? (job as { documentId: string }).documentId : null;
      const firmId = (job as { firmId: string }).firmId;
      const jobType = job.type ?? (documentId ? "ocr" : null);
      if (!documentId || !jobType) {
        logWarn("worker_invalid_job_payload", { jobType: (job as { type?: string }).type, hasDocumentId: !!documentId });
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
          logWarn("worker_unknown_job_type", { jobType, documentId, firmId });
      }
    } catch (err) {
      const documentId = "documentId" in job ? (job as { documentId: string }).documentId : null;
      const firmId = (job as { firmId: string }).firmId;
      const jobType = (job as { type?: string }).type ?? "unknown";
      const errMsg = err instanceof Error ? err.message : String(err);
      logError("worker_job_error", { documentId, firmId, jobType, error: errMsg });
      if (documentId) {
        const failureStage =
          jobType === "ocr"
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
          await prisma.document.update({
            where: { id: documentId },
            data: {
              status: "FAILED",
              failureStage,
              failureReason: errMsg.slice(0, 2000),
            },
          });
        } catch {
          // ignore
        }
      }
      await sleep(1000);
    }
  }
}

run().catch((e) => {
  logError("worker_fatal", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
