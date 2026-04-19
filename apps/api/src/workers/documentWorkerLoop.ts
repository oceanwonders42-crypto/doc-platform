import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import {
  popJob,
  enqueueClassificationJob,
  enqueueExtractionJob,
  enqueueCaseMatchJob,
  type PostRouteSyncJobPayload,
} from "../services/queue";
import { getObjectBuffer } from "../services/storage";
import { countPagesFromBuffer } from "../services/pageCount";
import { classifyAndExtract } from "../ai/docRecognition";
import { runOcrPipeline } from "../services/ocr";
import { analyzeRisks } from "../ai/riskAnalyzer";
import { analyzeDocumentInsights } from "../ai/documentInsights";
import { summarizeDocument } from "../ai/documentSummary";
import { classify } from "../ai/docClassifier";
import { detectTrafficMatterType } from "../ai/trafficMatterDetector";
import { runExtractors } from "../ai/extractors";
import { extractInsuranceOfferFields } from "../ai/extractors/insuranceOfferExtractor";
import { extractCourtFields } from "../ai/extractors/courtExtractor";
import { extractTrafficCitationFields } from "../ai/extractors/trafficCitationExtractor";
import { extractTrafficStatuteCode } from "../ai/extractors/trafficStatuteExtractor";
import { createOrUpdateTrafficMatter } from "../services/trafficMatterService";
import { matchDocumentToCase } from "../services/caseMatching";
import { routeDocument } from "../services/documentRouting";
import { hasFeature } from "../services/featureFlags";
import { rebuildCaseTimeline } from "../services/caseTimeline";
import { pushCaseIntelligenceToCrm } from "../integrations/crm/pushService";
import { createNotification } from "../services/notifications";
import { emitWebhookEvent } from "../services/webhooks";
import { pushDocumentToClio } from "../integrations/clioAdapter";
import { getPresignedGetUrl } from "../services/storage";
import { logInfo } from "../lib/logger";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function yearMonth(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

type WorkerOcrDocument = {
  mimeType?: string | null;
  originalName?: string | null;
  documentId?: string;
  firmId?: string;
};

type WorkerOcrDependencies = {
  runOcrPipeline: typeof runOcrPipeline;
};

type RecognitionTextQuery = (sql: string, params: [string, string]) => Promise<unknown>;

function normalizeMimeType(mimeType?: string | null): string {
  return (mimeType ?? "").toLowerCase();
}

function normalizeOriginalName(originalName?: string | null): string {
  return (originalName ?? "").toLowerCase();
}

export function getOcrNoTextReviewState() {
  return {
    status: "NEEDS_REVIEW" as const,
    reviewState: "IN_REVIEW" as const,
    processingStage: "ocr" as const,
    failureStage: "ocr" as const,
    failureReason: "No OCR text extracted" as const,
  };
}

export function inferWorkerOcrMimeType(
  doc: Pick<WorkerOcrDocument, "mimeType" | "originalName">
): string | undefined {
  const mimeType = normalizeMimeType(doc.mimeType);
  if (mimeType) {
    return mimeType;
  }

  const originalName = normalizeOriginalName(doc.originalName);
  if (originalName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (originalName.endsWith(".jpg") || originalName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (originalName.endsWith(".png")) {
    return "image/png";
  }
  if (originalName.endsWith(".tif") || originalName.endsWith(".tiff")) {
    return "image/tiff";
  }

  return undefined;
}

export function isPdfLikeDocument(doc: Pick<WorkerOcrDocument, "mimeType" | "originalName">): boolean {
  const mimeType = normalizeMimeType(doc.mimeType);
  const originalName = normalizeOriginalName(doc.originalName);
  return mimeType === "application/pdf" || originalName.endsWith(".pdf");
}

export function isImageLikeDocument(doc: Pick<WorkerOcrDocument, "mimeType" | "originalName">): boolean {
  const mimeType = normalizeMimeType(doc.mimeType);
  const originalName = normalizeOriginalName(doc.originalName);
  return mimeType.startsWith("image/")
    || originalName.endsWith(".jpg")
    || originalName.endsWith(".jpeg")
    || originalName.endsWith(".png")
    || originalName.endsWith(".tif")
    || originalName.endsWith(".tiff");
}

export function isWorkerOcrEligibleDocument(doc: Pick<WorkerOcrDocument, "mimeType" | "originalName">): boolean {
  return isPdfLikeDocument(doc) || isImageLikeDocument(doc);
}

export async function runWorkerOcr(
  buffer: Buffer,
  doc: WorkerOcrDocument,
  deps: WorkerOcrDependencies = { runOcrPipeline }
): Promise<string> {
  if (!isWorkerOcrEligibleDocument(doc)) {
    return "";
  }

  const result = await deps.runOcrPipeline(buffer, {
    mimeType: inferWorkerOcrMimeType(doc),
    documentId: doc.documentId,
    firmId: doc.firmId,
  });

  return result.fullText.trim();
}

export async function upsertRecognitionTextExcerpt(
  documentId: string,
  text: string,
  query: RecognitionTextQuery = (sql, params) => pgPool.query(sql, params)
): Promise<void> {
  await query(
    `
    insert into document_recognition (document_id, text_excerpt, updated_at)
    values ($1, $2, now())
    on conflict (document_id) do update set
      text_excerpt = excluded.text_excerpt,
      updated_at = now()
    `,
    [documentId, text]
  );
}

async function handleTimelineRebuild(caseId: string, firmId: string): Promise<void> {
  const startedAt = Date.now();
  logInfo("transfer_fast_path_async", {
    jobType: "timeline_rebuild",
    stage: "job_start",
    caseId,
    firmId,
  });
  console.log("Processing timeline rebuild job:", { caseId, firmId });
  await rebuildCaseTimeline(caseId, firmId);
  pushCaseIntelligenceToCrm({ firmId, caseId, actionType: "timeline_rebuilt" }).catch((e) =>
    console.warn("[crm] push after timeline_rebuilt failed", e)
  );
  logInfo("transfer_fast_path_async", {
    jobType: "timeline_rebuild",
    stage: "job_end",
    caseId,
    firmId,
    elapsedMs: Date.now() - startedAt,
  });
}

function getPostRouteCrmAction(action: string): "document_approved" | "document_routed" {
  return action === "approved" ? "document_approved" : "document_routed";
}

function shouldPushDocumentToClio(action: string): boolean {
  return action !== "approved";
}

async function handlePostRouteSyncJob(
  documentId: string,
  firmId: string,
  caseId: string,
  action: string
): Promise<void> {
  const startedAt = Date.now();
  logInfo("transfer_fast_path_async", {
    jobType: "post_route_sync",
    stage: "job_start",
    documentId,
    firmId,
    caseId,
    action,
  });
  console.log("Processing post-route sync job:", { documentId, firmId, caseId, action });

  const crmAction = getPostRouteCrmAction(action);
  const [crmSyncEnabled, firm, doc] = await Promise.all([
    hasFeature(firmId, "crm_sync"),
    prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    }),
    prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { spacesKey: true, originalName: true },
    }),
  ]);

  if (doc?.spacesKey && crmSyncEnabled && shouldPushDocumentToClio(action)) {
    const settings = (firm?.settings as Record<string, unknown> | null | undefined) ?? {};
    if (settings.crm === "clio") {
      try {
        logInfo("transfer_fast_path_async", {
          jobType: "post_route_sync",
          stage: "clio_push_start",
          documentId,
          firmId,
          caseId,
        });
        const fileUrl = await getPresignedGetUrl(doc.spacesKey);
        const pushResult = await pushDocumentToClio({
          firmId,
          caseId,
          documentId,
          fileName: doc.originalName || documentId,
          fileUrl,
        });
        if (!pushResult.ok) {
          console.warn("[worker] post-route Clio push failed", {
            caseId,
            documentId,
            error: pushResult.error,
          });
        }
        logInfo("transfer_fast_path_async", {
          jobType: "post_route_sync",
          stage: "clio_push_end",
          documentId,
          firmId,
          caseId,
          ok: pushResult.ok,
          error: pushResult.ok ? null : pushResult.error,
        });
      } catch (e) {
        console.warn("[worker] post-route Clio sync error", { caseId, documentId, err: e });
      }
    }
  }

  pushCaseIntelligenceToCrm({
    firmId,
    caseId,
    actionType: crmAction,
    documentId,
  }).catch((e) => console.warn("[crm] push after route follow-up failed", e));
  logInfo("transfer_fast_path_async", {
    jobType: "post_route_sync",
    stage: "crm_push_dispatched",
    documentId,
    firmId,
    caseId,
    action: crmAction,
  });
  logInfo("transfer_fast_path_async", {
    jobType: "post_route_sync",
    stage: "job_end",
    documentId,
    firmId,
    caseId,
    action,
    elapsedMs: Date.now() - startedAt,
  });
}

async function handleOcrJob(documentId: string, firmId: string): Promise<void> {
  const ocrStart = await prisma.document.updateMany({
    where: { id: documentId },
    data: { status: "PROCESSING", processingStage: "uploaded" },
  });
  if (ocrStart.count === 0) {
    console.warn(`[worker] skipping missing document before OCR: ${documentId}`);
    return;
  }

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  if (doc.duplicateOfId) {
    console.log(`Skipping duplicate document ${documentId} (duplicateOf ${doc.duplicateOfId})`);
    return;
  }

  const buf = await getObjectBuffer(doc.spacesKey);
  const pages = await countPagesFromBuffer(buf, doc.mimeType, doc.originalName);

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

  if (!isWorkerOcrEligibleDocument({ mimeType: doc.mimeType, originalName: doc.originalName })) {
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStage: "complete" },
    });
    emitWebhookEvent(firmId, "document.processed", {
      documentId,
      status: "UPLOADED",
      pageCount: pages,
      processingStage: "complete",
    }).catch((e) => console.warn("[webhooks] document.processed emit failed", e));
    console.log(`Done (non-OCR doc): ${documentId} (pages=${pages})`);
    return;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { processingStage: "ocr" },
  });
  const text = await runWorkerOcr(buf, {
    mimeType: doc.mimeType,
    originalName: doc.originalName,
    documentId,
    firmId,
  });
  await upsertRecognitionTextExcerpt(documentId, text);

  if (!text.trim()) {
    await pgPool.query(
      `
      update document_recognition set
        doc_type = $1,
        confidence = $2,
        updated_at = now()
      where document_id = $3
      `,
      ["unknown", 0, documentId]
    );
    const ocrReviewState = getOcrNoTextReviewState();
    await prisma.document.update({
      where: { id: documentId },
      data: ocrReviewState,
    });
    emitWebhookEvent(firmId, "document.processed", {
      documentId,
      status: ocrReviewState.status,
      pageCount: pages,
      processingStage: ocrReviewState.processingStage,
      failureStage: ocrReviewState.failureStage,
      failureReason: ocrReviewState.failureReason,
    }).catch((e) => console.warn("[webhooks] document.processed emit failed", e));
    console.log(`[worker] OCR produced no text; routed to review: ${documentId}`);
    return;
  }

  await enqueueClassificationJob({ documentId, firmId });
  console.log(`OCR done, queued classification: ${documentId}`);
}

async function handleClassificationJob(documentId: string, firmId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const { rows } = await pgPool.query<{ text_excerpt: string | null }>(
    `select text_excerpt from document_recognition where document_id = $1`,
    [documentId]
  );
  const text = rows[0]?.text_excerpt ?? null;
  if (!text) throw new Error(`No text_excerpt for document ${documentId}`);

  await prisma.document.update({
    where: { id: documentId },
    data: { processingStage: "classification" },
  });

  const generic = classifyAndExtract(text);
  const classification = classify(text, doc.originalName ?? "");
  let finalDocType = classification.docType !== "unknown" ? classification.docType : generic.docType;
  const finalConfidence =
    classification.docType !== "unknown" ? classification.confidence : generic.confidence;

  const [insuranceOn, courtOn] = await Promise.all([
    hasFeature(firmId, "insurance_extraction"),
    hasFeature(firmId, "court_extraction"),
  ]);
  if ((finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_")) && !insuranceOn) finalDocType = "other";
  if ((finalDocType === "court_filing" || finalDocType.startsWith("court_")) && !courtOn) finalDocType = "other";

  await pgPool.query(
    `
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
    `,
    [
      documentId,
      text,
      finalDocType,
      generic.clientName,
      generic.caseNumber,
      generic.incidentDate,
      finalConfidence,
    ]
  );

  const matterDetection = detectTrafficMatterType(text, finalDocType, doc.originalName ?? "");
  await pgPool.query(
    `
    update document_recognition set
      suggested_matter_type = $1,
      matter_routing_reason = $2,
      matter_review_required = $3,
      updated_at = now()
    where document_id = $4
    `,
    [
      matterDetection.matterType,
      matterDetection.reason,
      matterDetection.reviewRequired,
      documentId,
    ]
  );

  if (matterDetection.matterType === "TRAFFIC") {
    await enqueueExtractionJob({ documentId, firmId });
    console.log(
      `Classification done, queued extraction: ${documentId} (docType=${finalDocType}, matterType=${matterDetection.matterType})`
    );
    return;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { processingStage: "case_match" },
  });
  await enqueueCaseMatchJob({ documentId, firmId });
  await enqueueExtractionJob({ documentId, firmId });
  console.log(
    `Classification done, queued case_match + extraction: ${documentId} (docType=${finalDocType}, matterType=${matterDetection.matterType})`
  );
}

async function handleExtractionJob(documentId: string, firmId: string): Promise<void> {
  const startedAt = Date.now();
  logInfo("transfer_fast_path_async", {
    jobType: "extraction",
    stage: "job_start",
    documentId,
    firmId,
  });
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const { rows } = await pgPool.query<{
    text_excerpt: string | null;
    doc_type: string | null;
    client_name: string | null;
    case_number: string | null;
    incident_date: string | null;
    confidence: number | null;
    suggested_matter_type: string | null;
  }>(
    `select text_excerpt, doc_type, client_name, case_number, incident_date, confidence,
     coalesce(suggested_matter_type, 'PI') as suggested_matter_type
     from document_recognition where document_id = $1`,
    [documentId]
  );
  const rec = rows[0];
  if (!rec?.text_excerpt || !rec.doc_type) throw new Error(`Missing recognition data for ${documentId}`);
  const text = rec.text_excerpt;
  const finalDocType = rec.doc_type;
  const suggestedMatterType = rec.suggested_matter_type ?? "PI";

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
  const extractedFields = runExtractors(text, finalDocType, baseFields);

  const [insuranceOn, courtOn] = await Promise.all([
    hasFeature(firmId, "insurance_extraction"),
    hasFeature(firmId, "court_extraction"),
  ]);
  let insuranceFields: { settlementOffer?: number } | null = null;
  if (insuranceOn && finalDocType.startsWith("insurance_")) {
    const raw = await extractInsuranceOfferFields({ text, fileName: doc.originalName ?? undefined });
    insuranceFields = raw ? { settlementOffer: raw.settlementOffer ?? undefined } : null;
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

  await pgPool.query(
    `
    update document_recognition set
      insurance_fields = $1,
      court_fields = $2,
      risks = $3,
      insights = $4,
      summary = $5,
      updated_at = now()
    where document_id = $6
    `,
    [insuranceFieldsJson, courtFieldsJson, risksJson, insightsJson, summaryJson, documentId]
  );

  if (insuranceFields?.settlementOffer != null && insuranceFields.settlementOffer > 0) {
    const caseId = doc.routedCaseId ?? null;
    createNotification(
      firmId,
      "settlement_offer_detected",
      "Settlement offer extracted",
      `A settlement offer of $${Number(insuranceFields.settlementOffer).toLocaleString()} was extracted from a document.`,
      { documentId, amount: insuranceFields.settlementOffer, ...(caseId ? { caseId } : {}) }
    ).catch((e) => console.warn("[notifications] settlement_offer_detected (extraction) failed", e));
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

  const finalConfidence =
    rec.confidence == null
      ? 0
      : typeof rec.confidence === "number"
        ? rec.confidence
        : Number(rec.confidence) || 0;
  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractedFields: extractedFields as Prisma.InputJsonValue,
      confidence: finalConfidence,
    },
  });

  if (suggestedMatterType === "TRAFFIC") {
    const matterDetection = detectTrafficMatterType(text, finalDocType, doc.originalName ?? "");
    const citationResult = extractTrafficCitationFields(text);
    const statuteResult = extractTrafficStatuteCode(text);
    const reviewRequired =
      matterDetection.reviewRequired ||
      statuteResult.reviewRecommended ||
      !citationResult.fields.citationNumber ||
      (citationResult.confidence.citationNumber ?? 0) < 0.8;

    const { id: trafficMatterId, created } = await createOrUpdateTrafficMatter({
      firmId,
      sourceDocumentId: documentId,
      documentTypeOfOrigin: finalDocType,
      citationFields: citationResult.fields,
      citationConfidence: citationResult.confidence,
      statuteResult,
      routingConfidence: matterDetection.routingConfidence,
      reviewRequired,
    });

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "NEEDS_REVIEW",
        reviewState: "IN_REVIEW",
        routingStatus: "needs_review",
        processingStage: "complete",
      },
    });

    emitWebhookEvent(firmId, "document.processed", {
      documentId,
      status: "NEEDS_REVIEW",
      processingStage: "complete",
      trafficMatterId,
      trafficMatterCreated: created,
    }).catch((e) => console.warn("[webhooks] document.processed (traffic) emit failed", e));
    console.log(
      `Traffic matter ${created ? "created" : "updated"}: ${trafficMatterId} from document ${documentId}`
    );
    return;
  }

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

  await prisma.document.update({
    where: { id: documentId },
    data: { processingStage: "complete" },
  });
  console.log(`Extraction done asynchronously: ${documentId}`);
  logInfo("transfer_fast_path_async", {
    jobType: "extraction",
    stage: "job_end",
    documentId,
    firmId,
    elapsedMs: Date.now() - startedAt,
  });
}

async function handleCaseMatchJob(documentId: string, firmId: string): Promise<void> {
  const startedAt = Date.now();
  logInfo("transfer_fast_path_async", {
    jobType: "case_match",
    stage: "job_start",
    documentId,
    firmId,
  });
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { routedCaseId: true },
  });
  if (existingDocument?.routedCaseId) {
    console.log(`Case match skipped (already routed): ${documentId} -> ${existingDocument.routedCaseId}`);
    logInfo("transfer_fast_path_async", {
      jobType: "case_match",
      stage: "skip_already_routed",
      documentId,
      firmId,
      routedCaseId: existingDocument.routedCaseId,
      elapsedMs: Date.now() - startedAt,
    });
    return;
  }

  const { rows: matterRows } = await pgPool.query<{ suggested_matter_type: string | null }>(
    `select coalesce(suggested_matter_type, 'PI') as suggested_matter_type
     from document_recognition where document_id = $1`,
    [documentId]
  );
  if (matterRows[0]?.suggested_matter_type === "TRAFFIC") {
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStage: "complete" },
    });
    emitWebhookEvent(firmId, "document.processed", {
      documentId,
      status: "UPLOADED",
      processingStage: "complete",
    }).catch((e) => console.warn("[webhooks] document.processed emit failed", e));
    console.log(`Case match skipped (TRAFFIC matter): ${documentId}`);
    return;
  }

  const { rows } = await pgPool.query<{
    case_number: string | null;
    client_name: string | null;
  }>(
    `select case_number, client_name from document_recognition where document_id = $1`,
    [documentId]
  );
  const rec = rows[0];
  const caseNumber = rec?.case_number ?? null;
  const clientName = rec?.client_name ?? null;

  const rule = await prisma.routingRule.findUnique({ where: { firmId } });
  const minAutoRouteConfidence = rule?.minAutoRouteConfidence ?? 0.9;
  const autoRouteEnabled = rule?.autoRouteEnabled ?? false;

  const match = await matchDocumentToCase(firmId, { caseNumber, clientName }, null);
  let matchConfidence = match.matchConfidence;
  let matchedCaseId = match.caseId;
  let suggestedCaseId = matchedCaseId;

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
      }).catch((e) => console.warn("[webhooks] case.created emit failed", e));
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
        ).catch((e) => console.warn("[notifications] case_created_from_doc failed", e));
        await prisma.document.update({
          where: { id: documentId },
          data: { processingStage: "complete" },
        });
        emitWebhookEvent(firmId, "document.processed", {
          documentId,
          status: "UPLOADED",
          processingStage: "complete",
          caseId: newCase.id,
        }).catch((e) => console.warn("[webhooks] document.processed emit failed", e));
        await pgPool.query(
          `update document_recognition set match_confidence = 1, match_reason = $1, suggested_case_id = $3, updated_at = now() where document_id = $2`,
          ["Case auto-created from document", documentId, newCase.id]
        );
        console.log(`Auto-created case ${newCase.id} from document ${documentId}, routed`);
        logInfo("transfer_fast_path_async", {
          jobType: "case_match",
          stage: "job_end",
          documentId,
          firmId,
          routedCaseId: newCase.id,
          mode: "auto_create",
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
    }
  }

  if (
    autoRouteEnabled &&
    suggestedCaseId != null &&
    matchedCaseId != null &&
    matchConfidence >= minAutoRouteConfidence
  ) {
    const routed = await routeDocument(firmId, documentId, matchedCaseId, {
      actor: "system",
      action: "auto_routed",
      routedSystem: "auto",
      routingStatus: "routed",
      metaJson: { matchConfidence, caseId: matchedCaseId },
    });
    if (routed.ok) {
      console.log(`Auto-routed document ${documentId} to case ${matchedCaseId}`);
      await prisma.document.update({
        where: { id: documentId },
        data: { processingStage: "complete" },
      });
      emitWebhookEvent(firmId, "document.processed", {
        documentId,
        status: "UPLOADED",
        processingStage: "complete",
        caseId: matchedCaseId,
      }).catch((e) => console.warn("[webhooks] document.processed emit failed", e));
      logInfo("transfer_fast_path_async", {
        jobType: "case_match",
        stage: "job_end",
        documentId,
        firmId,
        routedCaseId: matchedCaseId,
        mode: "auto_route",
        elapsedMs: Date.now() - startedAt,
      });
    } else {
      await prisma.document.updateMany({
        where: { id: documentId },
        data: {
          status: "NEEDS_REVIEW",
          reviewState: "IN_REVIEW",
          routingStatus: "needs_review",
          processingStage: "complete",
        },
      });
      emitWebhookEvent(firmId, "document.processed", {
        documentId,
        status: "NEEDS_REVIEW",
        processingStage: "complete",
        suggestedCaseId: matchedCaseId,
      }).catch((e) => console.warn("[webhooks] document.processed emit failed", e));
      await prisma.documentAuditEvent.create({
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
  } else {
    await prisma.document.updateMany({
      where: { id: documentId },
      data: {
        status: "NEEDS_REVIEW",
        reviewState: "IN_REVIEW",
        routingStatus: suggestedCaseId != null ? "needs_review" : null,
        processingStage: "complete",
      },
    });
    emitWebhookEvent(firmId, "document.processed", {
      documentId,
      status: "NEEDS_REVIEW",
      processingStage: "complete",
      suggestedCaseId: suggestedCaseId ?? undefined,
    }).catch((e) => console.warn("[webhooks] document.processed emit failed", e));
    if (suggestedCaseId != null) {
      await prisma.documentAuditEvent.create({
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

  await pgPool.query(
    `update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, updated_at = now() where document_id = $3`,
    [matchConfidence, match.matchReason ?? null, documentId, matchedCaseId]
  );
  console.log(`Case match done: ${documentId}`);
  logInfo("transfer_fast_path_async", {
    jobType: "case_match",
    stage: "job_end",
    documentId,
    firmId,
    suggestedCaseId: matchedCaseId,
    routingRequiredReview: !(autoRouteEnabled && suggestedCaseId != null && matchedCaseId != null && matchConfidence >= minAutoRouteConfidence),
    elapsedMs: Date.now() - startedAt,
  });
}

async function runDocumentWorkerLoop(loopLabel: string): Promise<void> {
  console.log(`${loopLabel} started. Waiting for jobs (ocr, classification, extraction, case_match, timeline_rebuild, post_route_sync)...`);

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
      if (job.type === "post_route_sync") {
        const syncJob = job as PostRouteSyncJobPayload;
        await handlePostRouteSyncJob(
          syncJob.documentId,
          syncJob.firmId,
          syncJob.caseId,
          syncJob.action
        );
        continue;
      }

      const documentId = "documentId" in job ? (job as { documentId: string }).documentId : null;
      const firmId = (job as { firmId: string }).firmId;
      const jobType = job.type ?? (documentId ? "ocr" : null);
      if (!documentId || !jobType) {
        console.warn(`${loopLabel} invalid job payload (missing type or documentId):`, job);
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
          console.warn(`${loopLabel} unknown job type:`, jobType);
      }
    } catch (err) {
      const documentId = "documentId" in job ? (job as { documentId: string }).documentId : null;
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      console.error(`[${loopLabel}] error`, { documentId, firmId: (job as { firmId: string }).firmId, error: errMsg, stack: errStack });
      if (documentId) {
        try {
          await prisma.document.update({
            where: { id: documentId },
            data: { status: "FAILED" },
          });
        } catch {
          // ignore
        }
      }
      await sleep(1000);
    }
  }
}

let workerLoopPromise: Promise<void> | null = null;

export function startDocumentWorkerLoop(options?: { label?: string }): Promise<void> {
  if (!workerLoopPromise) {
    workerLoopPromise = runDocumentWorkerLoop(options?.label ?? "worker");
  }
  return workerLoopPromise;
}
