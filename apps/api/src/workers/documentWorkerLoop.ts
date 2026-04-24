import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import {
  buildJobDedupeKey,
  getFirmConcurrencyActiveCount,
  heartbeatFirmConcurrencyLease,
  popJob,
  requeueJob,
  releaseFirmConcurrencyLease,
  getRedisQueueSnapshot,
  enqueueClassificationJob,
  enqueueExtractionJob,
  enqueueCaseMatchJob,
  settleJobDeduplication,
  tryAcquireFirmConcurrencyLease,
  type FirmConcurrencyLease,
  type JobPayload,
  type PostRouteSyncJobPayload,
} from "../services/queue";
import { recordDeferredJobAttempt, type DeferredJobType } from "../services/deferredJobTelemetry";
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
import { routeDocument } from "../services/documentRouting";
import {
  getExtractedForRouting,
  saveRoutingScoreSnapshot,
  scoreDocumentRouting,
} from "../services/routingScorer";
import { hasFeature } from "../services/featureFlags";
import { canUseClioAutoUpdate } from "../services/planPolicy";
import { rebuildCaseTimeline } from "../services/caseTimeline";
import { pushCaseIntelligenceToCrm } from "../integrations/crm/pushService";
import { createNotification } from "../services/notifications";
import { emitWebhookEvent } from "../services/webhooks";
import { pushDocumentToClio, syncClioMatterWriteBackOnIngest } from "../integrations/clioAdapter";
import { getPresignedGetUrl } from "../services/storage";
import { logInfo } from "../lib/logger";
import {
  buildTaskCacheKey,
  DOCUMENT_RECOGNITION_PROMPTS,
  DOCUMENT_RECOGNITION_TASKS,
  getStoredTextHash,
  getTaskCacheResponseMeta,
  inspectTaskCache,
  logTaskCacheDecision,
  resolveTaskCache,
  serializeJsonbParam,
  upsertTaskCacheEntry,
} from "../services/documentRecognitionCache";
import { buildRoutingExplanation } from "../services/documentRoutingDecision";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const OCR_REQUEUE_DELAY_MS = 50;
let activeOcrJobCount = 0;
const DEFAULT_MAX_QUEUED_JOBS_PER_FIRM = 20;
const DEFAULT_MAX_CONCURRENT_JOBS_PER_FIRM = 2;
let currentDocumentWorkerPerFirmConcurrency = DEFAULT_MAX_CONCURRENT_JOBS_PER_FIRM;
let currentDocumentWorkerFirmQueuedCap = DEFAULT_MAX_QUEUED_JOBS_PER_FIRM;
let currentDocumentWorkerOcrConcurrency = 1;

function getPerFirmQueuedLimit(): number {
  return Math.max(1, currentDocumentWorkerFirmQueuedCap);
}

function getPerFirmConcurrentLimit(): number {
  return Math.max(1, currentDocumentWorkerPerFirmConcurrency);
}

async function shouldDeferJobForFirmCap(
  firmId: string | null,
  queuedLimit = getPerFirmQueuedLimit(),
  concurrentLimit = getPerFirmConcurrentLimit()
): Promise<{
  defer: boolean;
  activeForFirm: number;
  queuedForFirm: number;
}> {
  if (!firmId) {
    return { defer: false, activeForFirm: 0, queuedForFirm: 0 };
  }

  try {
    const snapshot = await getRedisQueueSnapshot();
    const activeForFirm = snapshot.byFirm[firmId]?.running ?? 0;
    const firmQueued = snapshot.byFirm[firmId]?.queued ?? 0;
    return {
      defer: shouldDeferJobForFirmLimits(activeForFirm, firmQueued, queuedLimit, concurrentLimit),
      activeForFirm,
      queuedForFirm: firmQueued,
    };
  } catch {
    const activeForFirm = await getFirmConcurrencyActiveCount(firmId, concurrentLimit).catch(() => 0);
    return {
      defer: activeForFirm >= Math.max(1, concurrentLimit),
      activeForFirm,
      queuedForFirm: 0,
    };
  }
}

function normalizeDeferredJobAttempt(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

function parseQueuedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function buildFirmConcurrencyToken(
  loopLabel: string,
  job: JobPayload,
  attempt: number,
  documentId: string | null,
  caseId: string | null
): string {
  return [
    loopLabel,
    job.type,
    job.firmId,
    documentId ?? caseId ?? "job",
    String(attempt),
    randomUUID(),
  ].join(":");
}

function startFirmConcurrencyLeaseHeartbeat(
  lease: FirmConcurrencyLease,
  context: {
    loopLabel: string;
    jobType: JobPayload["type"];
    firmId: string;
    documentId: string | null;
    caseId: string | null;
  }
): NodeJS.Timeout {
  const heartbeatIntervalMs = Math.max(5_000, Math.trunc(lease.ttlMs / 3));
  const timer = setInterval(() => {
    heartbeatFirmConcurrencyLease(lease)
      .then((refreshed) => {
        if (!refreshed) {
          console.warn(`[${context.loopLabel}] lost shared firm concurrency lease heartbeat`, {
            firmId: context.firmId,
            jobType: context.jobType,
            documentId: context.documentId,
            caseId: context.caseId,
          });
        }
      })
      .catch((error) => {
        console.warn(`[${context.loopLabel}] failed to refresh shared firm concurrency lease`, {
          firmId: context.firmId,
          jobType: context.jobType,
          documentId: context.documentId,
          caseId: context.caseId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, heartbeatIntervalMs);
  timer.unref?.();
  return timer;
}

function resolveDeferredJobType(job: { type?: string }): DeferredJobType | null {
  switch (job.type) {
    case "ocr":
    case "classification":
    case "extraction":
    case "case_match":
    case "timeline_rebuild":
    case "post_route_sync":
      return job.type;
    default:
      return null;
  }
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

type WorkerRoutingStateDocument = {
  source?: string | null;
  routedCaseId?: string | null;
  status?: string | null;
  reviewState?: string | null;
  processingStage?: string | null;
  routingStatus?: string | null;
};

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

export function isWorkerEmailSourceDocument(
  doc: Pick<WorkerRoutingStateDocument, "source">
): boolean {
  return doc.source === "email";
}

export function isWorkerReviewFallbackRecorded(
  doc: Pick<WorkerRoutingStateDocument, "status" | "reviewState" | "processingStage" | "routingStatus">
): boolean {
  return doc.status === "NEEDS_REVIEW"
    && doc.processingStage === "complete"
    && (doc.reviewState === "IN_REVIEW" || doc.routingStatus === "needs_review");
}

export function shouldWorkerDeferCaseMatchUntilAfterExtraction(
  doc: Pick<WorkerRoutingStateDocument, "source">,
  suggestedMatterType: string
): boolean {
  return suggestedMatterType !== "TRAFFIC" && isWorkerEmailSourceDocument(doc);
}

export function shouldWorkerQueueCaseMatchAfterExtraction(
  doc: Pick<WorkerRoutingStateDocument, "source" | "routedCaseId" | "status" | "reviewState" | "processingStage" | "routingStatus">,
  suggestedMatterType: string
): boolean {
  if (!shouldWorkerDeferCaseMatchUntilAfterExtraction(doc, suggestedMatterType)) {
    return false;
  }

  if (doc.routedCaseId) {
    return false;
  }

  return !isWorkerReviewFallbackRecorded(doc);
}

export function getWorkerCaseMatchSkipReason(
  doc: Pick<WorkerRoutingStateDocument, "routedCaseId" | "status" | "reviewState" | "processingStage" | "routingStatus">
): "already_routed" | "review_fallback_recorded" | null {
  if (doc.routedCaseId) {
    return "already_routed";
  }

  if (isWorkerReviewFallbackRecorded(doc)) {
    return "review_fallback_recorded";
  }

  return null;
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

export function getPostRouteClioAutoUpdateGateSource(options: {
  clioAutoUpdateEnabled: boolean;
  legacyClioSyncEnabled: boolean;
}): "entitlement" | "legacy_flag" | null {
  if (options.clioAutoUpdateEnabled) {
    return "entitlement";
  }

  if (options.legacyClioSyncEnabled) {
    return "legacy_flag";
  }

  return null;
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
  const [legacyClioSyncEnabled, firm, doc] = await Promise.all([
    hasFeature(firmId, "crm_sync"),
    prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true, plan: true },
    }),
    prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { spacesKey: true, originalName: true },
    }),
  ]);
  const clioAutoUpdateEnabled = canUseClioAutoUpdate(firm?.plan);
  const clioAutoUpdateGateSource = getPostRouteClioAutoUpdateGateSource({
    clioAutoUpdateEnabled,
    legacyClioSyncEnabled,
  });

  if (doc?.spacesKey && clioAutoUpdateGateSource && shouldPushDocumentToClio(action)) {
    const settings = (firm?.settings as Record<string, unknown> | null | undefined) ?? {};
    if (settings.crm === "clio") {
      try {
        logInfo("transfer_fast_path_async", {
          jobType: "post_route_sync",
          stage: "clio_push_start",
          documentId,
          firmId,
          caseId,
          gateSource: clioAutoUpdateGateSource,
        });
        const fileUrl = await getPresignedGetUrl(doc.spacesKey);
        const pushResult = await pushDocumentToClio({
          firmId,
          caseId,
          documentId,
          fileName: doc.originalName || documentId,
          fileUrl,
        });
        const pushError = "error" in pushResult ? pushResult.error : null;
        if (!pushResult.ok) {
          console.warn("[worker] post-route Clio push failed", {
            caseId,
            documentId,
            error: pushError,
          });
        } else {
          const writeBackResult = await syncClioMatterWriteBackOnIngest({
            firmId,
            caseId,
            documentId,
          });
          logInfo("transfer_fast_path_async", {
            jobType: "post_route_sync",
            stage: "clio_writeback_end",
            documentId,
            firmId,
            caseId,
            noteStatus: writeBackResult.noteStatus,
            claimNumberStatus: writeBackResult.claimNumberStatus,
            claimNumber: writeBackResult.claimNumber ?? null,
            currentClaimNumber: writeBackResult.currentClaimNumber ?? null,
            noteError: writeBackResult.noteError ?? null,
            claimNumberError: writeBackResult.claimNumberError ?? null,
            gateSource: clioAutoUpdateGateSource,
          });
        }
        logInfo("transfer_fast_path_async", {
          jobType: "post_route_sync",
          stage: "clio_push_end",
          documentId,
          firmId,
          caseId,
          ok: pushResult.ok,
          error: pushResult.ok ? null : pushError,
          gateSource: clioAutoUpdateGateSource,
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
    where: { id: documentId, firmId },
    data: { status: "PROCESSING", processingStage: "uploaded" },
  });
  if (ocrStart.count === 0) {
    console.warn(`[worker] skipping missing document before OCR: ${documentId}`);
    return;
  }

  const doc = await prisma.document.findFirst({ where: { id: documentId, firmId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  if (doc.duplicateOfId) {
    console.log(`Skipping duplicate document ${documentId} (duplicateOf ${doc.duplicateOfId})`);
    return;
  }

  const buf = await getObjectBuffer(doc.spacesKey);
  const pages = await countPagesFromBuffer(buf, doc.mimeType, doc.originalName);

  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { id: documentId, firmId },
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
    await tx.document.updateMany({
      where: { id: documentId, firmId },
      data: { status: "UPLOADED", processedAt: new Date() },
    });
  });

  if (!isWorkerOcrEligibleDocument({ mimeType: doc.mimeType, originalName: doc.originalName })) {
    await prisma.document.updateMany({
      where: { id: documentId, firmId },
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

  await prisma.document.updateMany({
    where: { id: documentId, firmId },
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
    await prisma.document.updateMany({
      where: { id: documentId, firmId },
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
  const doc = await prisma.document.findFirst({ where: { id: documentId, firmId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const { rows } = await pgPool.query<{
    text_excerpt: string | null;
    doc_type: string | null;
    client_name: string | null;
    case_number: string | null;
    incident_date: string | null;
    confidence: number | null;
    suggested_matter_type: string | null;
    normalized_text_hash: string | null;
    extracted_json: unknown;
  }>(
    `select text_excerpt, doc_type, client_name, case_number, incident_date, confidence,
      suggested_matter_type, normalized_text_hash, extracted_json
     from document_recognition where document_id = $1`,
    [documentId]
  );
  const existingRecognition = rows[0] ?? null;
  const text = existingRecognition?.text_excerpt ?? null;
  if (!text) throw new Error(`No text_excerpt for document ${documentId}`);
  const textHash = existingRecognition?.normalized_text_hash ?? getStoredTextHash(text);
  const [insuranceOn, courtOn] = await Promise.all([
    hasFeature(firmId, "insurance_extraction"),
    hasFeature(firmId, "court_extraction"),
  ]);
  const recognitionPrompt = {
    ...DOCUMENT_RECOGNITION_PROMPTS.recognition,
    promptVersion: `${DOCUMENT_RECOGNITION_PROMPTS.recognition.promptVersion}:insurance-${insuranceOn ? "on" : "off"}:court-${courtOn ? "on" : "off"}`,
  };
  const recognitionTaskKey = buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.recognition);
  const recognitionCacheState = inspectTaskCache(existingRecognition?.extracted_json ?? null, recognitionTaskKey, {
    textHash,
    firmId,
    documentId,
    ...recognitionPrompt,
  });
  const canReuseRecognition =
    existingRecognition != null &&
    Boolean(existingRecognition.doc_type) &&
    existingRecognition.suggested_matter_type != null &&
    recognitionCacheState.cacheUsed;

  await prisma.document.updateMany({
    where: { id: documentId, firmId },
    data: { processingStage: "classification" },
  });

  let finalDocType: string;
  let finalConfidence: number;
  let clientName: string | null;
  let caseNumber: string | null;
  let incidentDate: string | null;
  let suggestedMatterType: string;
  let recognitionCacheMeta = recognitionCacheState.meta;

  if (canReuseRecognition) {
    finalDocType = existingRecognition.doc_type ?? "unknown";
    finalConfidence =
      existingRecognition.confidence == null
        ? 0
        : typeof existingRecognition.confidence === "number"
          ? existingRecognition.confidence
          : Number(existingRecognition.confidence) || 0;
    clientName = existingRecognition.client_name ?? null;
    caseNumber = existingRecognition.case_number ?? null;
    incidentDate = existingRecognition.incident_date ?? null;
    suggestedMatterType = existingRecognition.suggested_matter_type ?? "PI";
  } else {
    const generic = classifyAndExtract(text);
    const classification = classify(text, doc.originalName ?? "");
    finalDocType = classification.docType !== "unknown" ? classification.docType : generic.docType;
    finalConfidence =
      classification.docType !== "unknown" ? classification.confidence : generic.confidence;
    clientName = generic.clientName;
    caseNumber = generic.caseNumber;
    incidentDate = generic.incidentDate;

    if ((finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_")) && !insuranceOn) finalDocType = "other";
    if ((finalDocType === "court_filing" || finalDocType.startsWith("court_")) && !courtOn) finalDocType = "other";

    const matterDetection = detectTrafficMatterType(text, finalDocType, doc.originalName ?? "");
    suggestedMatterType = matterDetection.matterType;
    const extractedJson = upsertTaskCacheEntry(existingRecognition?.extracted_json, recognitionTaskKey, {
      textHash,
      firmId,
      documentId,
      ...recognitionPrompt,
      generatedAt: new Date().toISOString(),
    });
    recognitionCacheMeta = getTaskCacheResponseMeta(extractedJson, recognitionTaskKey, {
      textHash,
      firmId,
      documentId,
      ...recognitionPrompt,
    });

    await pgPool.query(
      `
      insert into document_recognition
      (document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence,
       suggested_matter_type, matter_routing_reason, matter_review_required, normalized_text_hash, extracted_json, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      on conflict (document_id) do update set
        text_excerpt = excluded.text_excerpt,
        doc_type = excluded.doc_type,
        client_name = excluded.client_name,
        case_number = excluded.case_number,
        incident_date = excluded.incident_date,
        confidence = excluded.confidence,
        suggested_matter_type = excluded.suggested_matter_type,
        matter_routing_reason = excluded.matter_routing_reason,
        matter_review_required = excluded.matter_review_required,
        normalized_text_hash = excluded.normalized_text_hash,
        extracted_json = excluded.extracted_json,
        updated_at = now()
      `,
      [
        documentId,
        text,
        finalDocType,
        clientName,
        caseNumber,
        incidentDate,
        finalConfidence,
        matterDetection.matterType,
        matterDetection.reason,
        matterDetection.reviewRequired,
        textHash,
        extractedJson,
      ]
    );
  }
  logTaskCacheDecision(
    { source: "worker.classification", documentId },
    {
      ...recognitionCacheMeta,
      cacheUsed: recognitionCacheState.cacheUsed,
      recomputeReason: recognitionCacheState.recomputeReason,
    }
  );

  if (suggestedMatterType === "TRAFFIC") {
    await enqueueExtractionJob({ documentId, firmId });
    console.log(
      `Classification done, queued extraction: ${documentId} (docType=${finalDocType}, matterType=${suggestedMatterType})`
    );
    return;
  }

  if (shouldWorkerDeferCaseMatchUntilAfterExtraction(doc, suggestedMatterType)) {
    await prisma.document.updateMany({
      where: { id: documentId, firmId },
      data: { processingStage: "extraction" },
    });
    await enqueueExtractionJob({ documentId, firmId });
    console.log(
      `Classification done, queued extraction before case_match: ${documentId} (docType=${finalDocType}, matterType=${suggestedMatterType}, source=${doc.source ?? "unknown"})`
    );
    return;
  }

  await prisma.document.updateMany({
    where: { id: documentId, firmId },
    data: { processingStage: "case_match" },
  });
  await enqueueCaseMatchJob({ documentId, firmId });
  await enqueueExtractionJob({ documentId, firmId });
  console.log(
    `Classification done, queued case_match + extraction: ${documentId} (docType=${finalDocType}, matterType=${suggestedMatterType})`
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
  const doc = await prisma.document.findFirst({ where: { id: documentId, firmId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const { rows } = await pgPool.query<{
    text_excerpt: string | null;
    doc_type: string | null;
    client_name: string | null;
    case_number: string | null;
    incident_date: string | null;
    confidence: number | null;
    suggested_matter_type: string | null;
    normalized_text_hash: string | null;
    extracted_json: unknown;
    insurance_fields: unknown;
    court_fields: unknown;
    risks: unknown;
    insights: unknown;
    summary: unknown;
  }>(
    `select text_excerpt, doc_type, client_name, case_number, incident_date, confidence,
     coalesce(suggested_matter_type, 'PI') as suggested_matter_type, normalized_text_hash,
     extracted_json, insurance_fields, court_fields, risks, insights, summary
     from document_recognition where document_id = $1`,
    [documentId]
  );
  const rec = rows[0];
  if (!rec?.text_excerpt || !rec.doc_type) throw new Error(`Missing recognition data for ${documentId}`);
  const text = rec.text_excerpt;
  const finalDocType = rec.doc_type;
  const suggestedMatterType = rec.suggested_matter_type ?? "PI";
  const textHash = rec.normalized_text_hash ?? getStoredTextHash(text);

  await prisma.document.updateMany({
    where: { id: documentId, firmId },
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

  let extractedJson = rec.extracted_json;

  const risksResolution = await resolveTaskCache({
    extractedJson,
    taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.risks),
    textHash,
    firmId,
    documentId,
    existingValue: rec.risks ?? null,
    compute: () => {
      const { risks } = analyzeRisks(text);
      return risks.length > 0 ? risks : null;
    },
    logContext: { source: "worker.extraction", documentId },
    telemetryContext: { firmId, documentId, caseId: doc.routedCaseId ?? null, source: "worker.extraction" },
    ...DOCUMENT_RECOGNITION_PROMPTS.risks,
  });
  extractedJson = risksResolution.extractedJson;

  const insightsResolution = await resolveTaskCache({
    extractedJson,
    taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.insights),
    textHash,
    firmId,
    documentId,
    existingValue: rec.insights ?? null,
    compute: () => {
      const { insights } = analyzeDocumentInsights(text);
      return insights.length > 0 ? insights : null;
    },
    logContext: { source: "worker.extraction", documentId },
    telemetryContext: { firmId, documentId, caseId: doc.routedCaseId ?? null, source: "worker.extraction" },
    ...DOCUMENT_RECOGNITION_PROMPTS.insights,
  });
  extractedJson = insightsResolution.extractedJson;

  const summaryResolution = await resolveTaskCache({
    extractedJson,
    taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.summary),
    textHash,
    firmId,
    documentId,
    existingValue: rec.summary ?? null,
    compute: async () => {
      const { summary: summaryText, keyFacts } = await summarizeDocument(text, {
        firmId,
        documentId,
        caseId: doc.routedCaseId ?? null,
        source: "worker.extraction",
      });
      return summaryText || keyFacts.length > 0 ? { summary: summaryText, keyFacts } : null;
    },
    logContext: { source: "worker.extraction", documentId },
    telemetryContext: { firmId, documentId, caseId: doc.routedCaseId ?? null, source: "worker.extraction" },
    ...DOCUMENT_RECOGNITION_PROMPTS.summary,
  });
  extractedJson = summaryResolution.extractedJson;

  const insuranceResolution =
    insuranceOn && finalDocType.startsWith("insurance_")
      ? await resolveTaskCache({
          extractedJson,
          taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.insurance),
          textHash,
          firmId,
          documentId,
          existingValue: rec.insurance_fields ?? null,
          compute: async () => {
            const raw = await extractInsuranceOfferFields({
              text,
              fileName: doc.originalName ?? undefined,
              telemetryContext: {
                firmId,
                documentId,
                caseId: doc.routedCaseId ?? null,
                source: "worker.extraction",
              },
            });
            return raw ? { settlementOffer: raw.settlementOffer ?? undefined } : null;
          },
          logContext: { source: "worker.extraction", documentId },
          telemetryContext: { firmId, documentId, caseId: doc.routedCaseId ?? null, source: "worker.extraction" },
          ...DOCUMENT_RECOGNITION_PROMPTS.insurance,
        })
      : { value: rec.insurance_fields ?? null, reused: true, extractedJson };
  extractedJson = insuranceResolution.extractedJson;

  const courtResolution =
    courtOn && finalDocType.startsWith("court_")
      ? await resolveTaskCache({
          extractedJson,
          taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.court),
          textHash,
          firmId,
          documentId,
          existingValue: rec.court_fields ?? null,
          compute: () =>
            extractCourtFields({
              text,
              fileName: doc.originalName ?? undefined,
              telemetryContext: {
                firmId,
                documentId,
                caseId: doc.routedCaseId ?? null,
                source: "worker.extraction",
              },
            }),
          logContext: { source: "worker.extraction", documentId },
          telemetryContext: { firmId, documentId, caseId: doc.routedCaseId ?? null, source: "worker.extraction" },
          ...DOCUMENT_RECOGNITION_PROMPTS.court,
        })
      : { value: rec.court_fields ?? null, reused: true, extractedJson };
  extractedJson = courtResolution.extractedJson;

  await pgPool.query(
    `
    update document_recognition set
      insurance_fields = $1,
      court_fields = $2,
      risks = $3,
      insights = $4,
      summary = $5,
      normalized_text_hash = $6,
      extraction_version = $7,
      extracted_json = $8,
      updated_at = now()
    where document_id = $9
    `,
    [
      serializeJsonbParam(insuranceResolution.value),
      serializeJsonbParam(courtResolution.value),
      serializeJsonbParam(risksResolution.value),
      serializeJsonbParam(insightsResolution.value),
      serializeJsonbParam(summaryResolution.value),
      textHash,
      "document-extraction-cache-v1",
      serializeJsonbParam(extractedJson),
      documentId,
    ]
  );

  const insuranceFields =
    insuranceResolution.value != null && typeof insuranceResolution.value === "object"
      ? (insuranceResolution.value as { settlementOffer?: number })
      : null;

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
  await prisma.document.updateMany({
    where: { id: documentId, firmId },
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

    await prisma.document.updateMany({
      where: { id: documentId, firmId },
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

  if (shouldWorkerQueueCaseMatchAfterExtraction(doc, suggestedMatterType)) {
    await prisma.document.updateMany({
      where: { id: documentId, firmId },
      data: { processingStage: "case_match" },
    });
    await enqueueCaseMatchJob({ documentId, firmId });
    console.log(
      `Extraction done, queued case_match: ${documentId} (docType=${finalDocType}, matterType=${suggestedMatterType}, source=${doc.source ?? "unknown"})`
    );
    logInfo("transfer_fast_path_async", {
      jobType: "extraction",
      stage: "queued_case_match",
      documentId,
      firmId,
      source: doc.source ?? null,
      elapsedMs: Date.now() - startedAt,
    });
    return;
  }

  await prisma.document.updateMany({
    where: { id: documentId, firmId },
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
  const existingDocument = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: {
      routedCaseId: true,
      status: true,
      reviewState: true,
      processingStage: true,
      routingStatus: true,
      originalName: true,
      source: true,
    },
  });
  if (!existingDocument) {
    throw new Error(`Document not found: ${documentId}`);
  }
  const caseMatchSkipReason = getWorkerCaseMatchSkipReason(existingDocument);
  if (caseMatchSkipReason === "already_routed") {
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
  if (caseMatchSkipReason === "review_fallback_recorded") {
    console.log(`Case match skipped (review fallback already recorded): ${documentId}`);
    logInfo("transfer_fast_path_async", {
      jobType: "case_match",
      stage: "skip_review_fallback_recorded",
      documentId,
      firmId,
      status: existingDocument.status,
      reviewState: existingDocument.reviewState,
      routingStatus: existingDocument.routingStatus,
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
    await prisma.document.updateMany({
      where: { id: documentId, firmId },
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

  const extractedForRouting = await getExtractedForRouting(documentId);
  const caseNumber = extractedForRouting?.caseNumber ?? null;
  const clientName = extractedForRouting?.clientName ?? null;
  const { rows: recognitionRows } = await pgPool.query<{ text_excerpt: string | null }>(
    `select text_excerpt from document_recognition where document_id = $1`,
    [documentId]
  );

  const rule = await prisma.routingRule.findUnique({ where: { firmId } });
  const minAutoRouteConfidence = rule?.minAutoRouteConfidence ?? 0.9;
  const autoRouteEnabled = rule?.autoRouteEnabled ?? false;
  const routingScore = await scoreDocumentRouting(
    {
      id: documentId,
      firmId,
      originalName: existingDocument.originalName ?? null,
      source: existingDocument.source ?? null,
      routedCaseId: existingDocument.routedCaseId ?? null,
      status: existingDocument.status ?? null,
    },
    {
      caseNumber,
      clientName,
      docType: extractedForRouting?.docType ?? null,
      providerName: extractedForRouting?.providerName ?? null,
      documentClientName: extractedForRouting?.documentClientName ?? null,
      emailClientName: extractedForRouting?.emailClientName ?? null,
    },
    recognitionRows[0]?.text_excerpt ?? null
  );
  await saveRoutingScoreSnapshot(firmId, documentId, routingScore).catch((error) => {
    console.warn("[routing] failed to persist routing score snapshot", {
      documentId,
      firmId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const routingExplanation = buildRoutingExplanation(routingScore, {
    minConfidence: minAutoRouteConfidence,
  });
  let matchConfidence = routingScore.confidence;
  let matchedCaseId = routingScore.chosenCaseId;
  let suggestedCaseId = routingExplanation.suggestedCaseId;
  let matchReason =
    routingScore.candidates[0]?.reason ??
    routingScore.signals.baseMatchReason ??
    routingExplanation.reviewReasons[0] ??
    null;

  if (
    matchedCaseId == null &&
    routingScore.candidates.length === 0 &&
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
        metaJson: {
          reason: "auto_create_from_doc",
          clientName: name,
          topSignals: routingExplanation.topSignals,
          reviewReasons: routingExplanation.reviewReasons,
        },
      });
      if (routed.ok) {
        createNotification(
          firmId,
          "case_created_from_doc",
          "Case created from document",
          `A new case "${name}" was created from an unmatched document and the document was routed to it.`,
          { caseId: newCase.id, documentId, clientName: name }
        ).catch((e) => console.warn("[notifications] case_created_from_doc failed", e));
        await prisma.document.updateMany({
          where: { id: documentId, firmId },
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
    routingExplanation.shouldAutoRoute
  ) {
    const routed = await routeDocument(firmId, documentId, matchedCaseId, {
      actor: "system",
      action: "auto_routed",
      routedSystem: "auto",
      routingStatus: "routed",
      metaJson: {
        matchConfidence,
        caseId: matchedCaseId,
        topSignals: routingExplanation.topSignals,
        candidateSummaries: routingExplanation.candidateSummaries,
      },
    });
    if (routed.ok) {
      console.log(`Auto-routed document ${documentId} to case ${matchedCaseId}`);
      await prisma.document.updateMany({
        where: { id: documentId, firmId },
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
        where: { id: documentId, firmId },
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
          metaJson: {
            matchConfidence,
            reason: routed.error,
            topSignals: routingExplanation.topSignals,
            candidateSummaries: routingExplanation.candidateSummaries,
            reviewReasons: routingExplanation.reviewReasons,
          },
        },
      });
    }
  } else {
    await prisma.document.updateMany({
      where: { id: documentId, firmId },
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
          metaJson: {
            matchConfidence,
            suggestedCaseId,
            topSignals: routingExplanation.topSignals,
            candidateSummaries: routingExplanation.candidateSummaries,
            reviewReasons: routingExplanation.reviewReasons,
          },
        },
      });
    }
  }

  await pgPool.query(
    `update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, updated_at = now() where document_id = $3`,
    [
      matchConfidence,
      matchReason ?? routingExplanation.reviewReasons[0] ?? null,
      documentId,
      suggestedCaseId,
    ]
  );
  console.log(`Case match done: ${documentId}`);
  logInfo("transfer_fast_path_async", {
    jobType: "case_match",
    stage: "job_end",
    documentId,
    firmId,
    suggestedCaseId,
    routingRequiredReview: !(
      autoRouteEnabled &&
      suggestedCaseId != null &&
      matchedCaseId != null &&
      routingExplanation.shouldAutoRoute
    ),
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

    if (shouldDeferJobForOcrCap(job.type, activeOcrJobCount, currentDocumentWorkerOcrConcurrency)) {
      try {
        await requeueJob(job);
        await sleep(OCR_REQUEUE_DELAY_MS);
        continue;
      } catch (error) {
        console.warn(`[${loopLabel}] failed to defer OCR job under concurrency cap; processing inline`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let outcome: "completed" | "failed" = "completed";
    let errorMessage: string | null = null;
    let holdsFirmSlot = false;
    let firmConcurrencyLease: FirmConcurrencyLease | null = null;
    let firmConcurrencyHeartbeat: NodeJS.Timeout | null = null;
    const holdsOcrSlot = job.type === "ocr";
    const startedAt = new Date();
    const resolvedJobType = resolveDeferredJobType(job);
    const queuedAt = parseQueuedAt(job.queuedAt) ?? startedAt;
    const attempt = normalizeDeferredJobAttempt(job.attempt);
    const firmId = (job as { firmId?: string }).firmId ?? null;
    const documentId = "documentId" in job ? (job as { documentId?: string }).documentId ?? null : null;
    const caseId = "caseId" in job ? (job as { caseId?: string }).caseId ?? null : null;

    try {
      if (!firmId) {
        outcome = "failed";
        errorMessage = "Invalid job payload: missing firmId";
        console.warn(`${loopLabel} invalid job payload (missing firmId):`, job);
        continue;
      }

      const firmCapState = await shouldDeferJobForFirmCap(firmId);
      if (firmCapState.defer) {
        try {
          await requeueJob(job);
          logInfo("document_worker_fairness", {
            stage: "firm_cap_defer",
            workerLabel: loopLabel,
            firmId,
            jobType: job.type,
            documentId,
            caseId,
            activeJobsForFirm: firmCapState.activeForFirm,
            queuedJobsForFirm: firmCapState.queuedForFirm,
            perFirmConcurrency: getPerFirmConcurrentLimit(),
            perFirmQueuedCap: getPerFirmQueuedLimit(),
          });
          await sleep(OCR_REQUEUE_DELAY_MS);
          continue;
        } catch (error) {
          console.warn(`[${loopLabel}] failed to defer firm-scoped job under fairness cap; processing inline`, {
            error: error instanceof Error ? error.message : String(error),
            firmId,
            jobType: job.type,
          });
        }
      }

      const acquiredFirmLease = await tryAcquireFirmConcurrencyLease({
        firmId,
        limit: getPerFirmConcurrentLimit(),
        token: buildFirmConcurrencyToken(loopLabel, job, attempt, documentId, caseId),
      });
      if (!acquiredFirmLease) {
        try {
          await requeueJob(job);
          logInfo("document_worker_fairness", {
            stage: "firm_cap_reservation_defer",
            workerLabel: loopLabel,
            firmId,
            jobType: job.type,
            documentId,
            caseId,
            activeJobsForFirm: await getFirmConcurrencyActiveCount(firmId, getPerFirmConcurrentLimit()).catch(() => null),
            perFirmConcurrency: getPerFirmConcurrentLimit(),
            perFirmQueuedCap: getPerFirmQueuedLimit(),
          });
          await sleep(OCR_REQUEUE_DELAY_MS);
          continue;
        } catch (error) {
          console.warn(`[${loopLabel}] failed to defer firm-scoped job after shared cap denial; processing inline`, {
            error: error instanceof Error ? error.message : String(error),
            firmId,
            jobType: job.type,
          });
        }
      } else {
        firmConcurrencyLease = acquiredFirmLease.lease;
        firmConcurrencyHeartbeat = startFirmConcurrencyLeaseHeartbeat(firmConcurrencyLease, {
          loopLabel,
          jobType: job.type,
          firmId,
          documentId,
          caseId,
        });
      }

      holdsFirmSlot = true;
      logInfo("document_worker_fairness", {
        stage: "job_start",
        workerLabel: loopLabel,
        firmId,
        jobType: job.type,
        documentId,
        caseId,
        activeJobsForFirm: acquiredFirmLease?.activeJobsForFirm ?? null,
      });

      if (holdsOcrSlot) {
        activeOcrJobCount += 1;
      }

      if (job.type === "timeline_rebuild") {
        await handleTimelineRebuild(job.caseId, job.firmId);
      } else if (job.type === "post_route_sync") {
        const syncJob = job as PostRouteSyncJobPayload;
        await handlePostRouteSyncJob(
          syncJob.documentId,
          syncJob.firmId,
          syncJob.caseId,
          syncJob.action
        );
      } else {
        const jobType = job.type ?? (documentId ? "ocr" : null);
        if (!documentId || !jobType || !firmId) {
          outcome = "failed";
          errorMessage = "Invalid job payload: missing type, documentId, or firmId";
          console.warn(`${loopLabel} invalid job payload (missing type, documentId, or firmId):`, job);
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
            outcome = "failed";
            errorMessage = `Unknown job type: ${jobType}`;
            console.warn(`${loopLabel} unknown job type:`, jobType);
        }
      }
    } catch (err) {
      outcome = "failed";
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      errorMessage = errMsg;
      console.error(`[${loopLabel}] error`, { documentId, firmId, error: errMsg, stack: errStack });
      if (documentId && firmId) {
        try {
          await prisma.document.updateMany({
            where: { id: documentId, firmId },
            data: { status: "FAILED" },
          });
        } catch {
          // ignore
        }
      }
      await sleep(1000);
    } finally {
      if (holdsFirmSlot && firmId) {
        if (firmConcurrencyHeartbeat) {
          clearInterval(firmConcurrencyHeartbeat);
        }
        const remainingFirmJobs = firmConcurrencyLease
          ? (await releaseFirmConcurrencyLease(firmConcurrencyLease)).activeJobsForFirm
          : null;
        logInfo("document_worker_fairness", {
          stage: "job_finish",
          workerLabel: loopLabel,
          firmId,
          jobType: job.type,
          documentId,
          caseId,
          activeJobsForFirm: remainingFirmJobs,
          outcome,
        });
      }

      if (holdsOcrSlot) {
        activeOcrJobCount = Math.max(0, activeOcrJobCount - 1);
      }

      if (resolvedJobType) {
        const finishedAt = new Date();
        await recordDeferredJobAttempt({
          firmId,
          documentId,
          caseId,
          jobType: resolvedJobType,
          action: "action" in job ? (job as { action?: string }).action ?? null : null,
          dedupeKey: buildJobDedupeKey(job),
          workerLabel: loopLabel,
          queuedAt,
          startedAt,
          finishedAt,
          attempt,
          outcome: outcome === "completed" ? "success" : "failed",
          errorMessage,
        });
      }

      try {
        await settleJobDeduplication(job, outcome);
      } catch (settleError) {
        console.warn(`[${loopLabel}] failed to settle deferred job dedupe`, {
          jobType: job.type,
          error: settleError,
        });
      }
    }
  }
}

const DEFAULT_PRODUCTION_WORKER_CONCURRENCY = 3;
const DEFAULT_NON_PRODUCTION_WORKER_CONCURRENCY = 1;
const MAX_DOCUMENT_WORKER_CONCURRENCY = 6;

type WorkerLoopRunner = (label: string) => Promise<void>;

function normalizeWorkerConcurrency(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  if (normalized < 1) {
    return fallback;
  }

  return Math.min(normalized, MAX_DOCUMENT_WORKER_CONCURRENCY);
}

export function getDocumentWorkerConcurrency(
  rawValue: string | null | undefined = process.env.DOCUMENT_WORKER_CONCURRENCY,
  nodeEnv: string | undefined = process.env.NODE_ENV
): number {
  const fallback = nodeEnv === "production"
    ? DEFAULT_PRODUCTION_WORKER_CONCURRENCY
    : DEFAULT_NON_PRODUCTION_WORKER_CONCURRENCY;

  if (rawValue == null || rawValue.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return normalizeWorkerConcurrency(parsed, fallback);
}

export function getDocumentWorkerOcrConcurrency(
  rawValue: string | null | undefined = process.env.DOCUMENT_WORKER_OCR_CONCURRENCY,
  workerConcurrency = getDocumentWorkerConcurrency()
): number {
  if (rawValue == null || rawValue.trim().length === 0) {
    return workerConcurrency;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Math.min(normalizeWorkerConcurrency(parsed, workerConcurrency), workerConcurrency);
}

function normalizePositiveLimit(value: number, fallback: number, max = 1000): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  if (normalized < 1) {
    return fallback;
  }

  return Math.min(normalized, max);
}

export function getDocumentWorkerPerFirmConcurrency(
  rawValue: string | null | undefined = process.env.DOCUMENT_WORKER_FIRM_CONCURRENCY ?? process.env.DOCUMENT_WORKER_PER_FIRM_CONCURRENCY,
  workerConcurrency = getDocumentWorkerConcurrency()
): number {
  const fallback = Math.min(DEFAULT_MAX_CONCURRENT_JOBS_PER_FIRM, Math.max(1, workerConcurrency));
  if (rawValue == null || rawValue.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Math.min(normalizeWorkerConcurrency(parsed, fallback), Math.max(1, workerConcurrency));
}

export function getDocumentWorkerFirmQueuedCap(
  rawValue: string | null | undefined = process.env.DOCUMENT_WORKER_FIRM_QUEUE_CAP ?? process.env.DOCUMENT_WORKER_FIRM_QUEUED_CAP
): number {
  if (rawValue == null || rawValue.trim().length === 0) {
    return DEFAULT_MAX_QUEUED_JOBS_PER_FIRM;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return normalizePositiveLimit(parsed, DEFAULT_MAX_QUEUED_JOBS_PER_FIRM);
}

export function shouldDeferJobForOcrCap(
  jobType: JobPayload["type"] | undefined,
  activeOcrJobs: number,
  ocrConcurrency: number
): boolean {
  return jobType === "ocr" && activeOcrJobs >= Math.max(1, ocrConcurrency);
}

export function shouldDeferJobForFirmLimits(
  activeForFirm: number,
  queuedForFirm: number,
  queuedLimit: number,
  concurrentLimit: number
): boolean {
  const normalizedConcurrentLimit = Math.max(1, concurrentLimit);
  if (activeForFirm >= normalizedConcurrentLimit) {
    return true;
  }

  if (queuedLimit <= 0 || activeForFirm <= 0) {
    return false;
  }

  return queuedForFirm >= queuedLimit;
}

export function getDocumentWorkerLabels(baseLabel: string, concurrency: number): string[] {
  const normalizedConcurrency = normalizeWorkerConcurrency(concurrency, 1);
  if (normalizedConcurrency === 1) {
    return [baseLabel];
  }

  return Array.from({ length: normalizedConcurrency }, (_value, index) => `${baseLabel}-${index + 1}`);
}

export async function runDocumentWorkerPool(options: {
  label: string;
  concurrency: number;
  runLoop?: WorkerLoopRunner;
}): Promise<void> {
  const runLoop = options.runLoop ?? runDocumentWorkerLoop;
  const labels = getDocumentWorkerLabels(options.label, options.concurrency);
  await Promise.all(labels.map((label) => runLoop(label)));
}

let workerLoopPromise: Promise<void> | null = null;

export function startDocumentWorkerLoop(options?: {
  label?: string;
  concurrency?: number;
  ocrConcurrency?: number;
  perFirmConcurrency?: number;
  perFirmQueuedCap?: number;
  runLoop?: WorkerLoopRunner;
}): Promise<void> {
  if (!workerLoopPromise) {
    const label = options?.label ?? "worker";
    const concurrency = normalizeWorkerConcurrency(
      options?.concurrency ?? getDocumentWorkerConcurrency(),
      1
    );
    const ocrConcurrency = getDocumentWorkerOcrConcurrency(
      options?.ocrConcurrency == null ? undefined : String(options.ocrConcurrency),
      concurrency
    );
    const perFirmConcurrency = options?.perFirmConcurrency == null
      ? getDocumentWorkerPerFirmConcurrency(undefined, concurrency)
      : Math.min(normalizeWorkerConcurrency(options.perFirmConcurrency, 1), concurrency);
    const perFirmQueuedCap = options?.perFirmQueuedCap == null
      ? getDocumentWorkerFirmQueuedCap()
      : normalizePositiveLimit(options.perFirmQueuedCap, DEFAULT_MAX_QUEUED_JOBS_PER_FIRM);

    activeOcrJobCount = 0;
    currentDocumentWorkerOcrConcurrency = ocrConcurrency;
    currentDocumentWorkerPerFirmConcurrency = perFirmConcurrency;
    currentDocumentWorkerFirmQueuedCap = perFirmQueuedCap;

    console.log(`[${label}] starting document worker pool`, {
      concurrency,
      ocrConcurrency,
      perFirmConcurrency,
      perFirmQueuedCap,
    });
    workerLoopPromise = runDocumentWorkerPool({
      label,
      concurrency,
      runLoop: options?.runLoop,
    });
  }
  return workerLoopPromise;
}

export function resetDocumentWorkerLoopForTest(): void {
  workerLoopPromise = null;
  activeOcrJobCount = 0;
  currentDocumentWorkerOcrConcurrency = 1;
  currentDocumentWorkerPerFirmConcurrency = DEFAULT_MAX_CONCURRENT_JOBS_PER_FIRM;
  currentDocumentWorkerFirmQueuedCap = DEFAULT_MAX_QUEUED_JOBS_PER_FIRM;
}
