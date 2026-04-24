import "dotenv/config";
import { extractTextFromPdf, classifyAndExtract } from "../ai/docRecognition";
import { analyzeRisks } from "../ai/riskAnalyzer";
import { analyzeDocumentInsights } from "../ai/documentInsights";
import { summarizeDocument } from "../ai/documentSummary";
import { classify } from "../ai/docClassifier";
import { runExtractors } from "../ai/extractors";
import { extractInsuranceOfferFields } from "../ai/extractors/insuranceOfferExtractor";
import { extractCourtFields } from "../ai/extractors/courtExtractor";
import { getObjectBuffer } from "../services/storage";
import { pgPool } from "../db/pg";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import type { RoutingCandidate } from "../services/routingScorer";

import { prisma } from "../db/prisma";
import { auth } from "./middleware/auth";
import { authWithScope } from "./middleware/authScope";
import { requireRole } from "./middleware/requireRole";
import { requireAdminOrFirmAdminForFirm } from "./middleware/requireAdminOrFirmAdmin";
import { requireAdminOrFirmAdminForProvider } from "./middleware/requireAdminOrFirmAdminForProvider";
import {
  requireProviderSession,
  createProviderSession,
  clearProviderSession,
} from "./middleware/providerSession";
import { requireExportFirm } from "./middleware/requireExportFirm";
import { rateLimitEndpoint } from "./middleware/rateLimitEndpoint";
import { requestIdAndLog } from "./middleware/requestIdAndLog";
import { sendError } from "./middleware/sendError";
import { errorLogMiddleware } from "./middleware/errorLogMiddleware";
import { putObject } from "../services/storage";
import {
  enqueueDocumentJob,
  enqueueOcrJob,
  enqueueExtractionJob,
  enqueuePostRouteSyncJob,
  enqueueTimelineRebuildJob,
  getRedisQueueSnapshot,
} from "../services/queue";
import { getCaseInsights } from "../services/caseInsights";
import {
  createNotification,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notifications";
import { buildCaseReportPdf } from "../services/caseReportPdf";
import { fetchCourtDocket } from "../court/docketFetcher";
import { testImapConnection } from "../email/imapPoller";
import { routeDocument } from "../services/documentRouting";
import {
  getExtractedForRouting,
  saveRoutingScoreSnapshot,
  scoreDocumentRouting,
} from "../services/routingScorer";
import { generateNarrative } from "../ai/narrativeAssistant";
import { explainDocument } from "../ai/documentExplain";
import { pushCrmWebhook } from "../integrations/crm/pushService";
import { buildOffersSummaryPdf } from "../services/offersSummaryPdf";
import { buildTimelineChronologyDocx, buildTimelineChronologyPdf } from "../services/timelineChronologyExport";
import { getPresignedGetUrl } from "../services/storage";
import { hasFeature, isEmailAutomationEnabled } from "../services/featureFlags";
import { getDocumentEmailAutomation } from "../services/emailAutomation";
import { getComposedFeatures } from "../services/featureCompatibility";
import { getClioAutoUpdateGateState } from "../services/clioAutoUpdateGate";
import {
  canMarkDocumentExportReady,
  getEffectiveDocumentReviewState,
  getNormalizedDocumentStatus,
  getStoredDocumentReviewState,
  isDocumentReviewState,
  type DocumentReviewStateValue,
} from "../services/documentReviewState";
import {
  canAccessDemandNarrativeDraft,
  isDemandPackageReleaseBlocked,
  isDemandReviewerRole,
  normalizeDemandPackageStatus,
  serializeDemandNarrativeDraft,
} from "../services/demandNarrativeReview";
import {
  getDemandNarrativeRetrievalPreview,
  updateDemandNarrativeRetrievalFeedback,
} from "../services/demandNarrativeRetrieval";
import casesRouter from "./routes/cases";
import clioRouter from "./routes/clio";
import contactsRouter from "./routes/contacts";
import demandBankRouter from "./routes/demandBank";
import integrationsRouter from "./routes/integrations";
import migrationRouter from "./routes/migration";
import {
  internalOrderSyncRouter,
  quickbooksIntegrationRouter,
  quickbooksOpsRouter,
} from "./routes/quickbooks";
import recordsRequestsRouter from "./routes/recordsRequests";
import trafficRouter from "./routes/traffic";
import { DemandReviewStatus, DocumentStatus, Prisma, Role } from "@prisma/client";
import { generateClioContactsCsv, generateClioMattersCsv } from "../exports/clioExport";
import { importClioMappingsFromCsv } from "../services/clioMappingsImport";
import { logSystemError } from "../services/errorLog";
import { signToken } from "../lib/jwt";
import { WEBHOOK_EVENTS } from "../services/webhooks";
import {
  createRecordsRequestDraft,
  getRequestWithRelations,
} from "../services/recordsRequestService";
import {
  normalizeRecordsRequestStatus,
  recordsRequestStatusLabel,
} from "../services/recordsRequestStatus";
import { startDocumentWorkerLoop } from "../workers/documentWorkerLoop";
import { validateProductionRuntime } from "../lib/productionRuntime";
import { ensureDemoSeedObjects } from "../dev/demoSeedObjects";
import { getBuildInfo } from "../lib/buildInfo";
import { logInfo } from "../lib/logger";
import { buildDocumentStorageKey } from "../services/documentStorageKeys";
import {
  getAiCacheHitRates,
  getAiCostLeaderboard,
  getAiCostSummary,
  getAiCostTimeseries,
  getDocumentAiCostSummary,
  getFirmAiCostSummary,
} from "../services/aiTaskTelemetry";
import { getDeferredJobTelemetryOverview } from "../services/deferredJobTelemetry";
import { buildWeeklyOperatorReport } from "../services/operatorWeeklyReport";
import { getPlanMetadata, listPlansForDisplay } from "../services/billingPlans";
import { getSystemHealth } from "../services/systemHealth";
import { getAbuseStats } from "../services/abuseTracking";
import {
  applyFilePattern,
  applyFolderPattern,
  buildDocumentNamingContext,
  getFirmExportNamingRules,
  getFolderForDocType,
  getRecognitionForDocument,
} from "../services/export";
import { buildVisibleCaseWhere } from "../services/caseVisibility";
import { syncClioCaseAssignmentsIfStale } from "../services/clioCaseAssignments";
import { buildRoutingExplanation } from "../services/documentRoutingDecision";
import { logActivity } from "../services/activityFeed";
import {
  loadRoutingFeedbackContext,
  recordRoutingFeedback,
} from "../services/routingFeedback";
import { buildDemandPackageReadinessSnapshot } from "../services/demandPackageWorkflow";
import {
  buildTaskCacheKey,
  computeDocumentExplainVariant,
  DOCUMENT_RECOGNITION_PROMPTS,
  DOCUMENT_RECOGNITION_TASKS,
  getStoredTextHash,
  getTaskCacheResponseMeta,
  inspectTaskCache,
  invalidateTaskCacheEntries,
  logTaskCacheDecision,
  resolveTaskCache,
  serializeJsonbParam,
  upsertTaskCacheEntry,
} from "../services/documentRecognitionCache";
import {
  createFirmApiKey,
  createFirmUser,
  createFirmWithDefaults,
  FirmOnboardingInputError,
} from "../services/firmOnboarding";
import {
  canIngestDocument,
  getFirmBillingUsageSnapshot,
  normalizePlanSlug,
  type CanIngestResult,
} from "../services/billingPlans";
import { enqueueJob, getJobCounts } from "../services/jobQueue";
import {
  acceptTeamInvite,
  createTeamInviteForSession,
  inspectTeamInvite,
  listTeamMembersForSession,
  updateTeamMemberForSession,
} from "../services/teamInvites";
import {
  analyzeBillsVsTreatment,
  analyzeMissingRecords,
  answerCaseQuestion,
} from "../services/caseAiWorkflows";

export const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
const buildInfo = getBuildInfo();
const nodeEnv = process.env.NODE_ENV ?? "development";

type DemandPackageAccessRecord = {
  id: string;
  title: string;
  status: string;
  generatedDocId: string | null;
};

type CaseAccessContext = {
  firmId: string;
  authRole: Role | string | null | undefined;
  userId: string | null;
  apiKeyId: string | null;
};

async function getDashboardFeatureFlagsForFirm(firmId: string) {
  const [
    exportsEnabled,
    migrationBatchEnabled,
    trafficEnabled,
    providersEnabled,
    providersMapEnabled,
    caseQaEnabled,
    missingRecordsEnabled,
    billsVsTreatmentEnabled,
    demandDraftsEnabled,
    demandAuditEnabled,
  ] = await Promise.all([
    hasFeature(firmId, "exports_enabled"),
    hasFeature(firmId, "migration_batch_enabled"),
    hasFeature(firmId, "traffic_enabled"),
    hasFeature(firmId, "providers_enabled"),
    hasFeature(firmId, "providers_map_enabled"),
    hasFeature(firmId, "case_qa_enabled"),
    hasFeature(firmId, "missing_records_enabled"),
    hasFeature(firmId, "bills_vs_treatment_enabled"),
    hasFeature(firmId, "demand_drafts_enabled"),
    hasFeature(firmId, "demand_audit_enabled"),
  ]);

  return {
    exports_enabled: exportsEnabled,
    migration_batch_enabled: migrationBatchEnabled,
    traffic_enabled: trafficEnabled,
    providers_enabled: providersEnabled,
    providers_map_enabled: providersMapEnabled,
    case_qa_enabled: caseQaEnabled,
    missing_records_enabled: missingRecordsEnabled,
    bills_vs_treatment_enabled: billsVsTreatmentEnabled,
    demand_drafts_enabled: demandDraftsEnabled,
    demand_audit_enabled: demandAuditEnabled,
  };
}

async function getDemandPackageAccessRecord(
  firmId: string,
  documentId: string
): Promise<DemandPackageAccessRecord | null> {
  return prisma.demandPackage.findFirst({
    where: { firmId, generatedDocId: documentId },
    select: { id: true, title: true, status: true, generatedDocId: true },
  });
}

async function filterVisibleDemandPackageDocuments<T extends { id: string }>(
  firmId: string,
  authRole: Role | string | null | undefined,
  items: T[]
): Promise<T[]> {
  if (isDemandReviewerRole(authRole) || items.length === 0) return items;
  const gatedPackages = await prisma.demandPackage.findMany({
    where: {
      firmId,
      generatedDocId: { in: items.map((item) => item.id) },
    },
    select: { generatedDocId: true, status: true },
  });
  if (gatedPackages.length === 0) return items;
  const blockedDocIds = new Set(
    gatedPackages
      .filter((pkg) => pkg.generatedDocId && isDemandPackageReleaseBlocked(pkg.status))
      .map((pkg) => pkg.generatedDocId as string)
  );
  if (blockedDocIds.size === 0) return items;
  return items.filter((item) => !blockedDocIds.has(item.id));
}

async function enforceDemandPackageDocumentAccess(
  res: Response,
  options: {
    firmId: string;
    documentId: string;
    authRole: Role | string | null | undefined;
    action: string;
  }
): Promise<boolean> {
  if (isDemandReviewerRole(options.authRole)) return true;
  const demandPackage = await getDemandPackageAccessRecord(options.firmId, options.documentId);
  if (!demandPackage || !isDemandPackageReleaseBlocked(demandPackage.status)) return true;
  res.status(403).json({
    ok: false,
    error: `Demand package "${demandPackage.title}" is pending attorney or firm-admin review and cannot be ${options.action} yet.`,
  });
  return false;
}

async function normalizeLegacyDocumentStatuses<
  T extends {
    id: string;
    status?: string | null;
    reviewState?: string | null;
    processingStage?: string | null;
    routedCaseId?: string | null;
    processedAt?: string | Date | null;
  }
>(firmId: string, items: T[]): Promise<Map<string, string>> {
  const normalizedById = new Map<string, string>();
  const updatesByStatus = new Map<string, string[]>();

  for (const item of items) {
    const nextStatus = getNormalizedDocumentStatus(item);
    const currentStatus = typeof item.status === "string" ? item.status : null;
    if (!nextStatus || nextStatus === currentStatus) continue;
    normalizedById.set(item.id, nextStatus);
    const group = updatesByStatus.get(nextStatus) ?? [];
    group.push(item.id);
    updatesByStatus.set(nextStatus, group);
  }

  if (updatesByStatus.size === 0) return normalizedById;

  await Promise.all(
    [...updatesByStatus.entries()].map(([nextStatus, ids]) =>
      prisma.document
        .updateMany({
          where: { firmId, id: { in: ids } },
          data: { status: nextStatus as DocumentStatus },
        })
        .catch((error) => {
          console.warn("[documents] failed to normalize legacy status", {
            firmId,
            ids,
            nextStatus,
            error,
          });
        })
    )
  );

  return normalizedById;
}

function serializeDemandPackageReviewItem(pkg: {
  id: string;
  title: string;
  status: string;
  generatedDocId: string | null;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const normalizedStatus = normalizeDemandPackageStatus(pkg.status);
  const rawStatus =
    typeof pkg.status === "string" && pkg.status.trim().length > 0
      ? pkg.status.trim().toLowerCase()
      : "draft";
  return {
    id: pkg.id,
    title: pkg.title,
    status: normalizedStatus ?? rawStatus,
    generatedDocId: pkg.generatedDocId ?? null,
    generatedAt: pkg.generatedAt?.toISOString() ?? null,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

function getCaseAccessContext(req: Request): CaseAccessContext {
  return {
    firmId: (req as any).firmId as string,
    authRole: (req as any).authRole as Role | string | null | undefined,
    userId: typeof (req as any).userId === "string" ? ((req as any).userId as string) : null,
    apiKeyId: typeof (req as any).apiKeyId === "string" ? ((req as any).apiKeyId as string) : null,
  };
}

async function ensureVisibleCase(
  req: Request,
  res: Response,
  caseId: string
): Promise<CaseAccessContext | null> {
  const accessContext = getCaseAccessContext(req);
  await syncClioCaseAssignmentsIfStale({
    firmId: accessContext.firmId,
    caseIds: [caseId],
  }).catch(() => undefined);

  const visibleCase = await prisma.legalCase.findFirst({
    where: buildVisibleCaseWhere({
      ...accessContext,
      caseId,
    }),
    select: { id: true },
  });
  if (!visibleCase) {
    res.status(404).json({ ok: false, error: "Case not found" });
    return null;
  }
  return accessContext;
}

type LoadedRoutingFeedbackContext = Awaited<
  ReturnType<typeof loadRoutingFeedbackContext>
>;

async function persistRoutingFeedbackOutcome(
  feedbackContext: LoadedRoutingFeedbackContext,
  input: {
    firmId: string;
    documentId: string;
    finalCaseId?: string | null;
    finalStatus?: string | null;
    finalDocType?: string | null;
    correctedBy?: string | null;
  }
): Promise<void> {
  if (!feedbackContext) return;
  await recordRoutingFeedback(
    {
      ...input,
      finalDocType: input.finalDocType ?? feedbackContext.predicted.docType ?? null,
    },
    feedbackContext.predicted,
    feedbackContext.features
  );
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function buildRoutingExplanationFromSnapshot(
  snapshot: {
    chosenCaseId: string | null;
    chosenFolder: string | null;
    chosenDocType: string | null;
    confidence: number | null;
    signalsJson: unknown;
    candidatesJson: unknown;
  },
  minConfidence: number
) {
  const signals = asPlainRecord(snapshot.signalsJson) ?? {};
  const rawCandidates = Array.isArray(snapshot.candidatesJson)
    ? snapshot.candidatesJson
    : [];
  const candidates: RoutingCandidate[] = rawCandidates
    .map((candidate) => {
      const record = asPlainRecord(candidate);
      if (!record || typeof record.caseId !== "string") return null;
      const source: RoutingCandidate["source"] =
        record.source === "pattern" ||
        record.source === "feedback" ||
        record.source === "case_match"
          ? record.source
          : "case_match";
      return {
        caseId: record.caseId,
        caseNumber:
          typeof record.caseNumber === "string" ? record.caseNumber : null,
        caseTitle: typeof record.caseTitle === "string" ? record.caseTitle : null,
        confidence:
          typeof record.confidence === "number" && Number.isFinite(record.confidence)
            ? record.confidence
            : 0,
        reason: typeof record.reason === "string" ? record.reason : "Routing candidate",
        source,
        patternId: typeof record.patternId === "string" ? record.patternId : undefined,
        patternName:
          typeof record.patternName === "string" ? record.patternName : undefined,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null);

  return buildRoutingExplanation(
    {
      chosenCaseId: snapshot.chosenCaseId,
      chosenFolder: snapshot.chosenFolder,
      chosenDocType: snapshot.chosenDocType,
      confidence:
        typeof snapshot.confidence === "number" && Number.isFinite(snapshot.confidence)
          ? snapshot.confidence
          : 0,
      candidates,
      matchedPatterns: [],
      signals: {
        caseNumber:
          typeof signals.caseNumber === "string" ? signals.caseNumber : null,
        clientName:
          typeof signals.clientName === "string" ? signals.clientName : null,
        docType: typeof signals.docType === "string" ? signals.docType : null,
        fileName:
          typeof signals.fileName === "string" ? signals.fileName : null,
        source: typeof signals.source === "string" ? signals.source : null,
        baseMatchReason:
          typeof signals.baseMatchReason === "string"
            ? signals.baseMatchReason
            : null,
        providerName:
          typeof signals.providerName === "string" ? signals.providerName : null,
        providerMatchReasons: asStringArray(signals.providerMatchReasons),
        documentClientName:
          typeof signals.documentClientName === "string"
            ? signals.documentClientName
            : null,
        emailClientName:
          typeof signals.emailClientName === "string"
            ? signals.emailClientName
            : null,
      },
    },
    { minConfidence }
  );
}
function getBearerTokenFromRequest(req: express.Request): string | null {
  const header = req.headers.authorization ?? req.headers.Authorization;
  const match = header?.toString().match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function resolveWebBaseUrl(req: express.Request): string {
  const configuredBaseUrl =
    process.env.DOC_WEB_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_DOC_WEB_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }
  const host = req.get("host");
  if (host) {
    return `${req.protocol}://${host}`.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

function sendTeamInviteError(res: express.Response, error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const inviteError = error as { status: number; message: string };
    res.status(inviteError.status).json({ ok: false, error: inviteError.message });
    return;
  }
  const fallbackMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected team invite error";
  res.status(500).json({ ok: false, error: fallbackMessage });
}
function normalizeBillingPlanSlug(planSlug: string | null | undefined): string {
  const rawPlan = typeof planSlug === "string" ? planSlug.trim().toLowerCase() : "";
  if (rawPlan === "starter") return "essential";
  return getPlanMetadata(rawPlan)?.slug ?? "essential";
}

function getJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function decimalToNullableNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
function buildVersionPayload(service: string) {
  return {
    ok: true,
    service,
    versionLabel: buildInfo.versionLabel,
    packageName: buildInfo.packageName,
    packageVersion: buildInfo.packageVersion,
    commitHash: buildInfo.sha,
    shortCommitHash: buildInfo.shortSha,
    buildTime: buildInfo.builtAt,
    buildSource: buildInfo.source,
    buildBranch: buildInfo.branch,
    buildDirty: buildInfo.dirty,
    build: buildInfo,
    nodeEnv,
  };
}

type FastPathTrace = {
  mark: (stage: "persistence_complete" | "audit_complete" | "enqueue_complete", meta?: Record<string, unknown>) => void;
};

const clioHandoffAuditOutcomeTypes = [
  "replay_success",
  "replay_rejected_legacy",
  "replay_rejected_data_changed",
  "forced_reexport",
] as const;

type ClioHandoffAuditOutcomeType = (typeof clioHandoffAuditOutcomeTypes)[number];

type ClioHandoffAuditReviewItem = {
  id: string;
  createdAt: string;
  outcomeType: ClioHandoffAuditOutcomeType | "unknown";
  batchId: string | null;
  handoffExportId: string | null;
  hasIdempotencyKey: boolean;
  reason: string | null;
};

function createFastPathTrace(
  res: express.Response,
  routeName: "documents_route" | "documents_approve" | "cases_upload",
  meta: Record<string, unknown>
): FastPathTrace {
  const startedAt = Date.now();
  const baseMeta = {
    trace: "transfer_fast_path",
    route: routeName,
    ...meta,
  };

  logInfo("transfer_fast_path", {
    ...baseMeta,
    stage: "request_start",
    elapsedMs: 0,
  });

  res.once("finish", () => {
    logInfo("transfer_fast_path", {
      ...baseMeta,
      stage: "response_sent",
      statusCode: res.statusCode,
      elapsedMs: Date.now() - startedAt,
    });
  });

  return {
    mark(stage, stageMeta) {
      logInfo("transfer_fast_path", {
        ...baseMeta,
        ...stageMeta,
        stage,
        elapsedMs: Date.now() - startedAt,
      });
    },
  };
}

function buildUploadBillingPayload(result: CanIngestResult) {
  return {
    documents: {
      status: result.status,
      currentDocs: result.currentDocs,
      documentLimitMonthly: result.limit,
      pageLimitMonthly: result.limit,
      softCapReached: result.softCapReached,
      overageDocs: result.overageDocs,
      overageDollars: result.overageDollars,
      billingStatus: result.billingStatus,
    },
  };
}

type IncomingUploadFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
};

type IngestUploadedFileResult =
  | {
      duplicate: true;
      documentId: string;
      existingId: string;
      spacesKey: string;
    }
  | {
      duplicate: false;
      documentId: string;
      spacesKey: string;
    };

async function ingestUploadedFile(params: {
  firmId: string;
  file: IncomingUploadFile;
  source: string;
  externalId?: string | null;
}): Promise<IngestUploadedFileResult> {
  const { firmId, file, source, externalId } = params;
  const fileSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const fileSizeBytes = file.buffer.length;

  const duplicatesEnabled = await hasFeature(firmId, "duplicates_detection");
  if (duplicatesEnabled) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existing = await prisma.document.findFirst({
      where: {
        firmId,
        file_sha256: fileSha256,
        fileSizeBytes,
        ingestedAt: { gte: since },
      },
      orderBy: { ingestedAt: "desc" },
      select: { id: true, spacesKey: true },
    });

    if (existing) {
      const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
      await prisma.usageMonthly.upsert({
        where: { firmId_yearMonth: { firmId, yearMonth: ym } },
        create: {
          firmId,
          yearMonth: ym,
          pagesProcessed: 0,
          docsProcessed: 0,
          insuranceDocsExtracted: 0,
          courtDocsExtracted: 0,
          narrativeGenerated: 0,
          duplicateDetected: 1,
        },
        update: { duplicateDetected: { increment: 1 } },
      });
      await prisma.document.updateMany({
        where: { id: existing.id, firmId },
        data: { duplicateMatchCount: { increment: 1 } },
      });

      const doc = await prisma.document.create({
        data: {
          firmId,
          source,
          spacesKey: existing.spacesKey,
          originalName: file.originalname,
          mimeType: file.mimetype || "application/octet-stream",
          pageCount: 0,
          status: "UPLOADED",
          processingStage: "complete",
          external_id: externalId ?? null,
          file_sha256: fileSha256,
          fileSizeBytes,
          duplicateOfId: existing.id,
          ingestedAt: new Date(),
          processedAt: new Date(),
        },
      });

      return {
        duplicate: true,
        documentId: doc.id,
        existingId: existing.id,
        spacesKey: existing.spacesKey,
      };
    }
  }

  const documentId = crypto.randomUUID();
  const key = buildDocumentStorageKey({
    firmId,
    caseId: null,
    documentId,
    originalName: file.originalname,
  });

  await putObject(key, file.buffer, file.mimetype || "application/octet-stream");

  const doc = await prisma.document.create({
    data: {
      id: documentId,
      firmId,
      source,
      spacesKey: key,
      originalName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      pageCount: 0,
      status: "RECEIVED",
      external_id: externalId ?? null,
      file_sha256: fileSha256,
      fileSizeBytes,
      ingestedAt: new Date(),
    },
  });

  await enqueueDocumentJob({ documentId: doc.id, firmId });
  return { duplicate: false, documentId: doc.id, spacesKey: key };
}

function isLoopbackAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.replace(/^::ffff:/, "").replace(/^\[|\]$/g, "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

function isInternalCacheControlRequest(req: express.Request): boolean {
  if (nodeEnv !== "production") return true;

  const forwardedForHeader = req.headers["x-forwarded-for"];
  const forwardedFor =
    typeof forwardedForHeader === "string"
      ? forwardedForHeader.split(",").map((part) => part.trim()).filter(Boolean)
      : Array.isArray(forwardedForHeader)
        ? forwardedForHeader.flatMap((value) => value.split(",").map((part) => part.trim())).filter(Boolean)
        : [];
  const candidates = [req.ip, req.socket.remoteAddress, ...forwardedFor].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  return candidates.length > 0 && candidates.every((value) => isLoopbackAddress(value));
}

function parseMetricsLimit(value: unknown, fallback = 10, max = 50): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseMetricsRange(value: unknown): { from: Date; to: Date; days: number } {
  const raw = String(value ?? "7d").trim().toLowerCase();
  const match = raw.match(/^(\d{1,3})d$/);
  const days = match ? Math.max(1, Math.min(90, Number.parseInt(match[1]!, 10))) : 7;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
}

function parseCostBucket(value: unknown): "day" | "week" {
  return String(value ?? "day").trim().toLowerCase() === "week" ? "week" : "day";
}

function parseCostLeaderboardGroupBy(value: unknown): "task" | "document" | "case" | "firm" {
  const normalized = String(value ?? "task").trim().toLowerCase();
  return normalized === "document" || normalized === "case" || normalized === "firm" ? normalized : "task";
}

function requireNonProductionDevRoute(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true, build: buildInfo }));

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "api", build: buildInfo }));

app.get("/version", (_req, res) => res.json(buildVersionPayload("api")));

app.get("/readyz", async (_req, res) => {
  try {
    await pgPool.query("SELECT 1");
  } catch (e) {
    return res.status(503).json({ ok: false, error: String((e as Error).message) });
  }
  try {
    const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const { s3, bucket } = await import("../services/storage");
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    // Spaces connectivity check is optional
  }
  res.json({ ok: true });
});

// --- Dashboard auth (browser login flow) ---
// POST /auth/login — email + password; returns JWT for use as Bearer.
app.post("/auth/login", async (req, res) => {
  try {
    const body = req.body as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password required" });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      include: { firm: { select: { id: true, name: true, plan: true, status: true } } },
    });
    if (!user) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }
    const isDemo =
      process.env.NODE_ENV !== "production" &&
      !user.passwordHash &&
      (password === "demo" || password === "password");
    const passwordOk =
      isDemo || (user.passwordHash && (await bcrypt.compare(password, user.passwordHash)));
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }
    const token = signToken({
      userId: user.id,
      firmId: user.firmId,
      role: user.role,
      email: user.email,
    });
    return res.json({ ok: true, token });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// GET /auth/me — requires Bearer (JWT or API key). Returns current user/firm for dashboard.
app.get("/auth/me", auth, async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const userId = (req as any).userId as string | null;
    const authRole = (req as any).authRole as Role;
    const [user, firm] = await Promise.all([
      userId
        ? prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true },
          })
        : null,
      prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, name: true, plan: true, status: true },
      }),
    ]);
    if (!firm) {
      return res.status(404).json({ ok: false, error: "Firm not found" });
    }
    const role = (user?.role ?? authRole) as string;
    const isPlatformAdmin = role === Role.PLATFORM_ADMIN;
    const featureFlags = await getDashboardFeatureFlagsForFirm(firm.id);
    return res.json({
      ok: true,
      user: user
        ? { id: user.id, email: user.email, role: user.role }
        : { id: "", email: "", role },
      firm: { id: firm.id, name: firm.name, plan: firm.plan, status: firm.status },
      role,
      isPlatformAdmin,
      featureFlags,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Stub OAuth: redirect back to web app with error so login page can show "use email/password"
app.get("/auth/google", (req, res) => {
  const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
  if (redirectUri) res.redirect(302, `${redirectUri}?error=oauth_not_implemented`);
  else res.status(501).json({ ok: false, error: "OAuth not configured; use email/password" });
});
app.get("/auth/microsoft", (req, res) => {
  const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
  if (redirectUri) res.redirect(302, `${redirectUri}?error=oauth_not_implemented`);
  else res.status(501).json({ ok: false, error: "OAuth not configured; use email/password" });
});

app.get("/me/team", auth, async (req, res) => {
  const authToken = getBearerTokenFromRequest(req);
  if (!authToken) {
    return res.status(401).json({ ok: false, error: "Missing bearer token" });
  }
  try {
    const response = await listTeamMembersForSession(authToken);
    res.json(response);
  } catch (error) {
    sendTeamInviteError(res, error);
  }
});

app.post("/me/team/invite", auth, async (req, res) => {
  const authToken = getBearerTokenFromRequest(req);
  if (!authToken) {
    return res.status(401).json({ ok: false, error: "Missing bearer token" });
  }
  try {
    const body = (req.body ?? {}) as { email?: string; role?: string };
    const response = await createTeamInviteForSession({
      authToken,
      email: String(body.email ?? ""),
      role: String(body.role ?? "STAFF"),
      baseUrl: resolveWebBaseUrl(req),
    });
    res.json(response);
  } catch (error) {
    sendTeamInviteError(res, error);
  }
});

app.patch("/me/team/:userId", auth, async (req, res) => {
  const authToken = getBearerTokenFromRequest(req);
  if (!authToken) {
    return res.status(401).json({ ok: false, error: "Missing bearer token" });
  }
  try {
    const body = (req.body ?? {}) as { role?: string };
    const response = await updateTeamMemberForSession({
      authToken,
      userId: String(req.params.userId ?? ""),
      role: String(body.role ?? ""),
    });
    res.json(response);
  } catch (error) {
    sendTeamInviteError(res, error);
  }
});

app.get("/team/invite/accept", async (req, res) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const response = await inspectTeamInvite(token);
    res.json(response);
  } catch (error) {
    sendTeamInviteError(res, error);
  }
});

app.post("/team/invite/accept", async (req, res) => {
  try {
    const body = (req.body ?? {}) as { token?: string; password?: string };
    const response = await acceptTeamInvite({
      token: String(body.token ?? ""),
      password: String(body.password ?? ""),
    });
    res.json(response);
  } catch (error) {
    sendTeamInviteError(res, error);
  }
});

app.use("/cases", casesRouter);
app.use("/clio", clioRouter);
app.use("/api/clio", clioRouter);
app.use("/contacts", contactsRouter);
app.use("/demand-bank", demandBankRouter);
app.use("/integrations", integrationsRouter);
app.use("/integrations/quickbooks", quickbooksIntegrationRouter);
app.use("/api/qbo", quickbooksIntegrationRouter);
app.use("/migration", migrationRouter);
app.use("/me/quickbooks", quickbooksOpsRouter);
app.use("/records-requests", recordsRequestsRouter);
app.use("/traffic", trafficRouter);
app.use("/api/internal", internalOrderSyncRouter);

function serializeCompatibilityRecordsRequest<
  T extends {
    status: string;
    dateFrom: Date | null;
    dateTo: Date | null;
    requestDate?: Date | null;
    responseDate?: Date | null;
    sentAt?: Date | null;
    completedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
>(request: T) {
  const status = normalizeRecordsRequestStatus(request.status);
  return {
    ...request,
    status,
    statusLabel: recordsRequestStatusLabel(status),
    dateFrom: request.dateFrom?.toISOString() ?? null,
    dateTo: request.dateTo?.toISOString() ?? null,
    requestDate: (request.requestDate ?? request.sentAt ?? request.createdAt)?.toISOString() ?? null,
    responseDate: (request.responseDate ?? request.completedAt)?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

// Admin: list firms with stats (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/firms", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res) => {
  try {
    const [firms, docCounts, userCounts, usageAgg] = await Promise.all([
      prisma.firm.findMany({
        select: { id: true, name: true, status: true, plan: true, pageLimitMonthly: true, createdAt: true, features: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.document.groupBy({
        by: ["firmId"],
        _count: { id: true },
      }),
      prisma.user.groupBy({
        by: ["firmId"],
        _count: { id: true },
      }),
      prisma.usageMonthly.groupBy({
        by: ["firmId"],
        _sum: { docsProcessed: true, narrativeGenerated: true, pagesProcessed: true },
      }),
    ]);

    const docByFirm = new Map(docCounts.map((d) => [d.firmId, d._count.id]));
    const userByFirm = new Map(userCounts.map((u) => [u.firmId, u._count.id]));
    const usageByFirm = new Map(
      usageAgg.map((u) => [
        u.firmId,
        {
          documentsProcessed: u._sum.docsProcessed ?? 0,
          narrativeGenerated: u._sum.narrativeGenerated ?? 0,
          pagesProcessed: u._sum.pagesProcessed ?? 0,
        },
      ])
    );

    const body = firms.map((f) => ({
      ...getClioAutoUpdateGateState({
        plan: f.plan,
        features: f.features,
      }),
      firmId: f.id,
      firmName: f.name,
      planSlug: f.plan,
      status: f.status,
      plan: f.plan,
      pageLimitMonthly: f.pageLimitMonthly,
      createdAt: f.createdAt.toISOString(),
      documentsProcessed: docByFirm.get(f.id) ?? 0,
      activeUsers: userByFirm.get(f.id) ?? 0,
      usageStats: usageByFirm.get(f.id) ?? {
        documentsProcessed: 0,
        narrativeGenerated: 0,
        pagesProcessed: 0,
      },
    }));

    res.json({ ok: true, firms: body });
  } catch (e) {
    console.error("[admin/firms]", e);
    res.status(500).json({ ok: false, error: "Failed to load firms" });
  }
});

// Admin: get firm details, users, api keys, usage (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/firms/:firmId", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const firmId = String(req.params.firmId ?? "");
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        plan: true,
        pageLimitMonthly: true,
        retentionDays: true,
        status: true,
        createdAt: true,
        users: { select: { id: true, email: true, role: true, createdAt: true } },
        apiKeys: {
          where: { revokedAt: null },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            scopes: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

    const usageRow = await prisma.usageMonthly.findUnique({
      where: { firmId_yearMonth: { firmId, yearMonth: ym } },
      select: { yearMonth: true, pagesProcessed: true, docsProcessed: true, updatedAt: true },
    });

    const [docCount] = await prisma.document.groupBy({
      by: ["firmId"],
      where: { firmId },
      _count: { id: true },
    });

    res.json({
      ok: true,
      firm: {
        id: firm.id,
        name: firm.name,
        plan: firm.plan,
        pageLimitMonthly: firm.pageLimitMonthly,
        retentionDays: firm.retentionDays,
        status: firm.status,
        createdAt: firm.createdAt.toISOString(),
        documentCount: docCount?._count.id ?? 0,
      },
      users: firm.users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
      })),
      apiKeys: firm.apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
      usage: {
        yearMonth: usageRow?.yearMonth ?? ym,
        pagesProcessed: usageRow?.pagesProcessed ?? 0,
        docsProcessed: usageRow?.docsProcessed ?? 0,
        updatedAt: usageRow?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    console.error("[admin/firms/:firmId]", e);
    res.status(500).json({ ok: false, error: "Failed to load firm" });
  }
});

// Admin: update firm plan/pageLimitMonthly/status (requires PLATFORM_ADMIN_API_KEY)
app.patch("/admin/firms/:firmId", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const firmId = String(req.params.firmId ?? "");
    const body = (req.body ?? {}) as { plan?: string; pageLimitMonthly?: number; status?: string };

    const data: { plan?: string; pageLimitMonthly?: number; status?: string } = {};
    if (typeof body.plan === "string" && body.plan.trim()) {
      const plan = normalizePlanSlug(body.plan);
      data.plan = plan;
      data.pageLimitMonthly = getPlanMetadata(plan).docLimitMonthly;
    }
    if (typeof body.pageLimitMonthly === "number" && body.pageLimitMonthly >= 0) data.pageLimitMonthly = body.pageLimitMonthly;
    if (typeof body.status === "string" && body.status.trim()) data.status = body.status.trim();

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, error: "No valid fields to update" });
    }

    const firm = await prisma.firm.update({
      where: { id: firmId },
      data,
      select: { id: true, name: true, plan: true, pageLimitMonthly: true, status: true },
    });
    res.json({ ok: true, firm });
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ ok: false, error: "Firm not found" });
    console.error("[admin/firms/:firmId PATCH]", e);
    res.status(500).json({ ok: false, error: "Failed to update firm" });
  }
});

// POST /firms — create firm (PLATFORM_ADMIN_API_KEY)
app.post("/firms", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { name, plan } = (req.body ?? {}) as { name?: string; plan?: string };
    const firm = await createFirmWithDefaults({ name: String(name ?? ""), plan });
    res.json({ ok: true, firm });
  } catch (e: any) {
    if (e instanceof FirmOnboardingInputError) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /firms/:id/users — create user (PLATFORM_ADMIN or FIRM_ADMIN for this firm)
app.post("/firms/:id/users", auth, requireAdminOrFirmAdminForFirm, async (req, res) => {
  try {
    const firmId = String(req.params.id ?? "");
    const { email, role, password } = (req.body ?? {}) as {
      email?: string;
      role?: string;
      password?: string;
    };
    const user = await createFirmUser({
      firmId,
      email: String(email ?? ""),
      role,
      password,
    });
    res.json({ ok: true, user });
  } catch (e: any) {
    if (e instanceof FirmOnboardingInputError) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    if (e?.code === "P2002") return res.status(409).json({ ok: false, error: "Email already exists" });
    if (e?.code === "P2003") return res.status(404).json({ ok: false, error: "Firm not found" });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /firms/:id/api-keys — create API key (PLATFORM_ADMIN or FIRM_ADMIN for this firm)
app.post("/firms/:id/api-keys", auth, requireAdminOrFirmAdminForFirm, async (req, res) => {
  try {
    const firmId = String(req.params.id ?? "");
    const { name } = (req.body ?? {}) as { name?: string };
    const apiKey = await createFirmApiKey({
      firmId,
      name,
      scopes: "ingest",
    });

    res.json({
      ok: true,
      apiKey: apiKey.apiKey,
      keyPrefix: apiKey.keyPrefix,
      id: apiKey.id,
      message: "Save this key now. It will not be shown again.",
    });
  } catch (e: any) {
    if (e instanceof FirmOnboardingInputError) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    if (e?.code === "P2003") return res.status(404).json({ ok: false, error: "Firm not found" });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Clio CSV exports (auth + STAFF role, firmId from key or query)
app.get("/exports/clio/contacts.csv", auth, requireRole(Role.STAFF), requireExportFirm, async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const csv = await generateClioContactsCsv(firmId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="clio-contacts.csv"');
    res.send(Buffer.from(csv, "utf-8"));
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/exports/clio/matters.csv", auth, requireRole(Role.STAFF), requireExportFirm, async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const csv = await generateClioMattersCsv(firmId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="clio-matters.csv"');
    res.send(Buffer.from(csv, "utf-8"));
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Clio matter ID mappings (import CSV, list)
app.get("/crm/clio/mappings", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const mappings = await prisma.crmCaseMapping.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
    });
    const caseIds = [...new Set(mappings.map((m) => m.caseId))];
    const cases = await prisma.legalCase.findMany({
      where: { id: { in: caseIds }, firmId },
      select: { id: true, caseNumber: true, title: true, clientName: true },
    });
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    const items = mappings.map((m) => {
      const c = caseMap.get(m.caseId);
      return {
        id: m.id,
        caseId: m.caseId,
        caseNumber: c?.caseNumber ?? null,
        caseTitle: c?.title ?? null,
        clientName: c?.clientName ?? null,
        externalMatterId: m.externalMatterId,
        createdAt: m.createdAt.toISOString(),
      };
    });
    res.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /crm/clio/mappings", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post(
  "/crm/clio/mappings/import",
  auth,
  requireRole(Role.STAFF),
  upload.single("file"),
  async (req, res) => {
    try {
      const firmId = (req as any).firmId as string;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Missing file (multipart field name must be 'file')" });
      }
      const result = await importClioMappingsFromCsv(firmId, file.buffer);
      res.json(result);
    } catch (e: any) {
      console.error("POST /crm/clio/mappings/import", e);
      res.status(400).json({
        ok: false,
        error: String(e?.message || e),
        created: 0,
        updated: 0,
        notFound: 0,
        rows: [],
      });
    }
  }
);

// Webhook endpoints
app.get("/webhooks", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const items = await prisma.webhookEndpoint.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        eventsJson: true,
        enabled: true,
        createdAt: true,
      },
    });
    res.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /webhooks", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/webhooks", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { url?: string; secret?: string; events?: string[] };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";
    const events = Array.isArray(body.events)
      ? body.events.filter((e) => typeof e === "string" && (e === "*" || WEBHOOK_EVENTS.includes(e as any)))
      : ["*"];

    if (!url) return res.status(400).json({ error: "url is required" });
    if (!secret) return res.status(400).json({ error: "secret is required" });

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "url must be a valid URL" });
    }

    const created = await prisma.webhookEndpoint.create({
      data: { firmId, url, secret, eventsJson: events, enabled: true },
      select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
    });
    res.status(201).json({ ok: true, item: created });
  } catch (e: any) {
    console.error("POST /webhooks", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/webhooks/:id", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as {
      url?: string;
      secret?: string;
      events?: string[];
      enabled?: boolean;
    };

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, firmId },
    });
    if (!existing) return res.status(404).json({ error: "Webhook not found" });

    const update: { url?: string; secret?: string; eventsJson?: string[]; enabled?: boolean } = {};
    if (typeof body.url === "string" && body.url.trim()) {
      try {
        new URL(body.url.trim());
        update.url = body.url.trim();
      } catch {
        return res.status(400).json({ error: "url must be a valid URL" });
      }
    }
    if (typeof body.secret === "string" && body.secret.trim()) update.secret = body.secret.trim();
    if (Array.isArray(body.events)) {
      update.eventsJson = body.events.filter(
        (e) => typeof e === "string" && (e === "*" || WEBHOOK_EVENTS.includes(e as any))
      );
    }
    if (typeof body.enabled === "boolean") update.enabled = body.enabled;

    const item = await prisma.webhookEndpoint.update({
      where: { id },
      data: update,
      select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
    });
    res.json({ ok: true, item });
  } catch (e: any) {
    console.error("PATCH /webhooks/:id", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete("/webhooks/:id", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const existing = await prisma.webhookEndpoint.findFirst({ where: { id, firmId } });
    if (!existing) return res.status(404).json({ error: "Webhook not found" });
    await prisma.webhookEndpoint.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /webhooks/:id", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Webhooks (firm-scoped) ===
app.get("/webhooks", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
    });
    res.json({ ok: true, items: endpoints });
  } catch (e: any) {
    console.error("GET /webhooks", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/webhooks", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { url?: string; secret?: string; events?: string[]; enabled?: boolean };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";
    if (!url) return res.status(400).json({ error: "url is required" });
    if (!secret || secret.length < 16) return res.status(400).json({ error: "secret must be at least 16 characters" });

    const events = Array.isArray(body.events) ? body.events.filter((e) => typeof e === "string") : [];
    const eventsJson = events.length > 0 ? events : ["document.processed", "document.routed", "case.created"];

    const ep = await prisma.webhookEndpoint.create({
      data: { firmId, url, secret, eventsJson, enabled: body.enabled !== false },
      select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
    });
    res.status(201).json({ ok: true, item: ep });
  } catch (e: any) {
    console.error("POST /webhooks", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/webhooks/:id", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { url?: string; secret?: string; events?: string[]; enabled?: boolean };

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, firmId },
    });
    if (!existing) return res.status(404).json({ error: "Webhook not found" });

    const data: { url?: string; secret?: string; eventsJson?: string[]; enabled?: boolean } = {};
    if (typeof body.url === "string" && body.url.trim()) data.url = body.url.trim();
    if (typeof body.secret === "string" && body.secret.length >= 16) data.secret = body.secret.trim();
    if (Array.isArray(body.events)) data.eventsJson = body.events.filter((e) => typeof e === "string");
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    const ep = await prisma.webhookEndpoint.update({
      where: { id },
      data,
      select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
    });
    res.json({ ok: true, item: ep });
  } catch (e: any) {
    console.error("PATCH /webhooks/:id", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: jobs list and retry (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/jobs", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const statusFilter = typeof req.query.status === "string" && req.query.status.trim()
      ? req.query.status.trim()
      : null;
    const firmIdFilter = typeof req.query.firmId === "string" && req.query.firmId.trim()
      ? req.query.firmId.trim()
      : null;
    const items = await prisma.job.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter as "queued" | "running" | "failed" | "done" } : {}),
        ...(firmIdFilter ? { firmId: firmIdFilter } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: { firm: { select: { name: true } } },
    });
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

app.post("/admin/jobs/:id/retry", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    if (job.status !== "failed") {
      return res.status(400).json({ ok: false, error: "Can only retry failed jobs" });
    }
    await prisma.job.update({
      where: { id },
      data: {
        status: "queued",
        runAt: new Date(),
        lastError: null,
        attempts: 0,
        updatedAt: new Date(),
      },
    });
    res.json({ ok: true, message: "Job queued for retry" });
  } catch (e) {
    next(e);
  }
});

// Admin: recent system errors (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/errors", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const serviceFilter = typeof req.query.service === "string" && req.query.service.trim()
      ? req.query.service.trim()
      : null;
    const logs = await prisma.systemErrorLog.findMany({
      where: serviceFilter ? { service: serviceFilter } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ ok: true, errors: logs });
  } catch (e) {
    next(e);
  }
});

app.get("/admin/system/health", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res) => {
  try {
    const health = await getSystemHealth();
    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000);
    const stuckProcessingCount = await prisma.document.count({
      where: {
        status: "PROCESSING",
        createdAt: { lt: staleCutoff },
      },
    });

    const enrichedHealth = {
      ...health,
      documentPipelineDegraded:
        health.redis !== "up" ||
        health.database !== "up" ||
        stuckProcessingCount > 0 ||
        health.recentOpenCriticalErrorsCount > 0,
      stuckProcessingCount,
      workerLastSeenAt: null as string | null,
      workerStale: false,
    };

    res.json({
      ok: true,
      ...enrichedHealth,
      health: enrichedHealth,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/admin/support/bug-reports", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 200);
    const statusFilter =
      typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : null;
    const priorityFilter =
      typeof req.query.priority === "string" && req.query.priority.trim() ? req.query.priority.trim() : null;
    const firmIdFilter =
      typeof req.query.firmId === "string" && req.query.firmId.trim() ? req.query.firmId.trim() : null;

    const reports = await prisma.appBugReport.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(priorityFilter ? { priority: priorityFilter } : {}),
        ...(firmIdFilter ? { firmId: firmIdFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      ok: true,
      reports: reports.map((report) => ({
        id: report.id,
        firmId: report.firmId,
        userId: report.userId,
        title: report.title,
        description: report.description,
        pageUrl: report.pageUrl,
        screenshotUrl: report.screenshotUrl,
        status: report.status,
        priority: report.priority,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/admin/security/activity", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res) => {
  try {
    const abuse = getAbuseStats();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await prisma.systemErrorLog.findMany({
      where: {
        createdAt: { gte: since },
        OR: [
          { area: "security" },
          { message: { contains: "Abuse threshold exceeded" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({
      ok: true,
      abuse,
      events: events.map((event) => ({
        id: event.id,
        service: event.service,
        message: event.message,
        area: event.area ?? null,
        route: event.route ?? null,
        method: event.method ?? null,
        severity: event.severity ?? null,
        status: event.status ?? null,
        createdAt: event.createdAt.toISOString(),
        resolvedAt: toIsoString(event.resolvedAt),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/admin/incidents", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 200);
    const statusFilter =
      typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : null;
    const severityFilter =
      typeof req.query.severity === "string" && req.query.severity.trim() ? req.query.severity.trim() : null;

    const incidents = await prisma.systemIncident.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(severityFilter ? { severity: severityFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      ok: true,
      incidents: incidents.map((incident) => ({
        id: incident.id,
        severity: incident.severity,
        title: incident.title,
        description: incident.description ?? null,
        status: incident.status,
        relatedErrorId: incident.relatedErrorId ?? null,
        createdAt: incident.createdAt.toISOString(),
        resolvedAt: toIsoString(incident.resolvedAt),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/admin/incidents/:id", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const incidentId = String(req.params.id ?? "");
    const incident = await prisma.systemIncident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      return res.status(404).json({ ok: false, error: "Incident not found" });
    }

    res.json({
      ok: true,
      incident: {
        id: incident.id,
        severity: incident.severity,
        title: incident.title,
        description: incident.description ?? null,
        status: incident.status,
        relatedErrorId: incident.relatedErrorId ?? null,
        createdAt: incident.createdAt.toISOString(),
        resolvedAt: toIsoString(incident.resolvedAt),
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/admin/incidents/:id", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const incidentId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { status?: string };
    const nextStatus = typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
    if (!["OPEN", "MITIGATING", "RESOLVED"].includes(nextStatus)) {
      return res.status(400).json({ ok: false, error: "Invalid incident status" });
    }

    const incident = await prisma.systemIncident.update({
      where: { id: incidentId },
      data: {
        status: nextStatus,
        resolvedAt: nextStatus === "RESOLVED" ? new Date() : null,
      },
    });

    res.json({
      ok: true,
      incident: {
        id: incident.id,
        severity: incident.severity,
        title: incident.title,
        description: incident.description ?? null,
        status: incident.status,
        relatedErrorId: incident.relatedErrorId ?? null,
        createdAt: incident.createdAt.toISOString(),
        resolvedAt: toIsoString(incident.resolvedAt),
      },
    });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, error: "Incident not found" });
    }
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: quality-control analytics (requires PLATFORM_ADMIN_API_KEY)
// Query params: firmId, dateFrom (ISO date), dateTo (ISO date), groupBy (day|week|month)
app.get("/admin/quality/analytics", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res, next) => {
  try {
    const q = (_req as any).query || {};
    const firmIdFilter =
      typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const dateFrom =
      typeof q.dateFrom === "string" && q.dateFrom.trim()
        ? new Date(q.dateFrom.trim())
        : null;
    const dateToRaw =
      typeof q.dateTo === "string" && q.dateTo.trim()
        ? new Date(q.dateTo.trim())
        : null;
    const dateTo =
      dateToRaw && !isNaN(dateToRaw.getTime())
        ? (() => {
            const d = new Date(dateToRaw);
            d.setUTCHours(23, 59, 59, 999);
            return d;
          })()
        : null;
    const groupBy = ["day", "week", "month"].includes(String(q.groupBy || "").toLowerCase())
      ? String(q.groupBy).toLowerCase()
      : null;

    const ingestedFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom && !isNaN(dateFrom.getTime())) ingestedFilter.gte = dateFrom;
    if (dateTo && !isNaN(dateTo.getTime())) ingestedFilter.lte = dateTo;
    const hasDateFilter = Object.keys(ingestedFilter).length > 0;

    const docWhereBase = {
      ...(firmIdFilter ? { firmId: firmIdFilter } : {}),
      ...(hasDateFilter ? { ingestedAt: ingestedFilter } : {}),
    };

    const [docsByStatus, totalDocs, processedDocs, autoRoutedCount, unmatchedCount, duplicateCount, latencyRows, usageAgg, failureReasons, firms, perFirmRows] =
      await Promise.all([
        prisma.document.groupBy({
          by: ["status"],
          where: docWhereBase,
          _count: { id: true },
        }),
        prisma.document.count({ where: docWhereBase }),
        prisma.document.count({
          where: { ...docWhereBase, status: { in: ["UPLOADED", "NEEDS_REVIEW", "UNMATCHED"] } },
        }),
        prisma.document.count({
          where: { ...docWhereBase, status: "UPLOADED" },
        }),
        prisma.document.count({
          where: { ...docWhereBase, status: "UNMATCHED" },
        }),
        prisma.document.count({
          where: { ...docWhereBase, duplicateOfId: { not: null } },
        }),
        (() => {
          const params: (string | Date)[] = [];
          let sql = `SELECT AVG(EXTRACT(EPOCH FROM ("processedAt" - "ingestedAt")) * 1000)::float AS avg_ms
            FROM "Document"
            WHERE "processedAt" IS NOT NULL AND "ingestedAt" IS NOT NULL`;
          if (firmIdFilter) {
            params.push(firmIdFilter);
            sql += ` AND "firmId" = $${params.length}`;
          }
          if (dateFrom && !isNaN(dateFrom.getTime())) {
            params.push(dateFrom);
            sql += ` AND "ingestedAt" >= $${params.length}`;
          }
          if (dateTo && !isNaN(dateTo.getTime())) {
            params.push(dateTo);
            sql += ` AND "ingestedAt" <= $${params.length}`;
          }
          return pgPool.query<{ avg_ms: number | null }>(sql, params);
        })(),
        firmIdFilter
          ? prisma.usageMonthly.aggregate({
              where: { firmId: firmIdFilter },
              _sum: { docsProcessed: true, duplicateDetected: true },
            })
          : prisma.usageMonthly.aggregate({
              _sum: { docsProcessed: true, duplicateDetected: true },
            }),
        prisma.systemErrorLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { message: true },
        }),
        prisma.firm.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        firmIdFilter
          ? Promise.resolve({ rows: [] })
          : (() => {
              const params: Date[] = [];
              let sql = `SELECT
                d."firmId" AS firm_id,
                COUNT(*)::text AS total_docs,
                COUNT(*) FILTER (WHERE d.status IN ('UPLOADED','NEEDS_REVIEW','UNMATCHED'))::text AS processed_docs,
                COUNT(*) FILTER (WHERE d.status = 'UPLOADED')::text AS auto_routed,
                COUNT(*) FILTER (WHERE d.status = 'UNMATCHED')::text AS unmatched,
                COUNT(*) FILTER (WHERE d."duplicateOfId" IS NOT NULL)::text AS duplicate_count,
                COUNT(*) FILTER (WHERE d.status = 'FAILED')::text AS failed_docs,
                COUNT(*) FILTER (WHERE d.status = 'NEEDS_REVIEW')::text AS needs_review_docs,
                AVG(EXTRACT(EPOCH FROM (d."processedAt" - d."ingestedAt")) * 1000) FILTER (WHERE d."processedAt" IS NOT NULL AND d."ingestedAt" IS NOT NULL) AS avg_ms
              FROM "Document" d
              WHERE 1=1`;
              if (dateFrom && !isNaN(dateFrom.getTime())) {
                params.push(dateFrom);
                sql += ` AND d."ingestedAt" >= $${params.length}`;
              }
              if (dateTo && !isNaN(dateTo.getTime())) {
                params.push(dateTo);
                sql += ` AND d."ingestedAt" <= $${params.length}`;
              }
              sql += ` GROUP BY d."firmId"`;
              return pgPool.query(sql, params);
            })(),
      ]);

    const latencyRow = (latencyRows as { rows: Array<{ avg_ms: number | null }> }).rows?.[0];
    const avgLatencyMs = latencyRow?.avg_ms ?? null;

    const usage = usageAgg;
    const docsProcessedUsage = Number(usage._sum.docsProcessed ?? 0) || 1;
    const duplicateFromUsage = Number(usage._sum.duplicateDetected ?? 0);
    const duplicateRateFromUsage = docsProcessedUsage > 0 ? duplicateFromUsage / docsProcessedUsage : 0;

    const docsByStatusMap = Object.fromEntries(
      docsByStatus.map((r) => [r.status, r._count.id])
    ) as Record<string, number>;
    const statuses = ["RECEIVED", "PROCESSING", "NEEDS_REVIEW", "UPLOADED", "FAILED", "UNMATCHED"];
    const docsByStatusObj = Object.fromEntries(
      statuses.map((s) => [s, docsByStatusMap[s] ?? 0])
    );

    const autoRouteRate = processedDocs > 0 ? autoRoutedCount / processedDocs : 0;
    const unmatchedRate = processedDocs > 0 ? unmatchedCount / processedDocs : 0;
    const duplicateRateDoc = totalDocs > 0 ? duplicateCount / totalDocs : duplicateRateFromUsage;

    const firmByName = new Map(firms.map((f) => [f.id, f.name]));
    const perFirmData = (perFirmRows as { rows: Array<{
      firm_id: string;
      total_docs: string;
      processed_docs: string;
      auto_routed: string;
      unmatched: string;
      duplicate_count: string;
      failed_docs: string;
      needs_review_docs: string;
      avg_ms: number | null;
    }> }).rows?.map((r) => {
      const total = parseInt(r.total_docs, 10) || 0;
      const processed = parseInt(r.processed_docs, 10) || 0;
      const autoRouted = parseInt(r.auto_routed, 10) || 0;
      const unmatched = parseInt(r.unmatched, 10) || 0;
      const dupCount = parseInt(r.duplicate_count, 10) || 0;
      return {
        firmId: r.firm_id,
        firmName: firmByName.get(r.firm_id) ?? r.firm_id,
        totalDocs: total,
        processedDocs: processed,
        autoRouteRate: processed > 0 ? Math.round((autoRouted / processed) * 10000) / 100 : 0,
        unmatchedRate: processed > 0 ? Math.round((unmatched / processed) * 10000) / 100 : 0,
        duplicateRate: total > 0 ? Math.round((dupCount / total) * 10000) / 100 : 0,
        avgProcessingLatencyMs: r.avg_ms != null ? Math.round(r.avg_ms) : null,
        failedDocs: parseInt(r.failed_docs, 10) || 0,
        needsReviewDocs: parseInt(r.needs_review_docs, 10) || 0,
      };
    }) ?? [];

    const messageCounts = new Map<string, number>();
    for (const { message } of failureReasons) {
      const key = message.length > 120 ? message.slice(0, 120) + "…" : message;
      messageCounts.set(key, (messageCounts.get(key) ?? 0) + 1);
    }
    const topFailureReasons = Array.from(messageCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    let timeSeries: Array<{ period: string; totalDocs: number; processedDocs: number; autoRouteRate: number; unmatchedRate: number }> | undefined;
    if (groupBy && !firmIdFilter) {
      const trunc = groupBy === "day" ? "day" : groupBy === "week" ? "week" : "month";
      const tsParams: Date[] = [];
      let tsSql = `SELECT
          DATE_TRUNC('${trunc}', d."ingestedAt"::timestamp)::date::text AS period,
          COUNT(*)::text AS total_docs,
          COUNT(*) FILTER (WHERE d.status IN ('UPLOADED','NEEDS_REVIEW','UNMATCHED'))::text AS processed_docs,
          COUNT(*) FILTER (WHERE d.status = 'UPLOADED')::text AS auto_routed,
          COUNT(*) FILTER (WHERE d.status = 'UNMATCHED')::text AS unmatched
        FROM "Document" d
        WHERE d."ingestedAt" IS NOT NULL`;
      if (dateFrom && !isNaN(dateFrom.getTime())) {
        tsParams.push(dateFrom);
        tsSql += ` AND d."ingestedAt" >= $${tsParams.length}`;
      }
      if (dateTo && !isNaN(dateTo.getTime())) {
        tsParams.push(dateTo);
        tsSql += ` AND d."ingestedAt" <= $${tsParams.length}`;
      }
      tsSql += ` GROUP BY DATE_TRUNC('${trunc}', d."ingestedAt"::timestamp) ORDER BY period ASC`;
      const { rows: tsRows } = await pgPool.query<{
        period: string;
        total_docs: string;
        processed_docs: string;
        auto_routed: string;
        unmatched: string;
      }>(tsSql, tsParams);
      timeSeries = (tsRows ?? []).map((r) => {
        const processed = parseInt(r.processed_docs, 10) || 0;
        const autoRouted = parseInt(r.auto_routed, 10) || 0;
        const unmatched = parseInt(r.unmatched, 10) || 0;
        return {
          period: r.period,
          totalDocs: parseInt(r.total_docs, 10) || 0,
          processedDocs: processed,
          autoRouteRate: processed > 0 ? Math.round((autoRouted / processed) * 10000) / 100 : 0,
          unmatchedRate: processed > 0 ? Math.round((unmatched / processed) * 10000) / 100 : 0,
        };
      });
    }

    const body: Record<string, unknown> = {
      ok: true,
      docsByStatus: docsByStatusObj,
      autoRouteRate: Math.round(autoRouteRate * 10000) / 100,
      unmatchedRate: Math.round(unmatchedRate * 10000) / 100,
      duplicateRate: Math.round((duplicateRateDoc || duplicateRateFromUsage) * 10000) / 100,
      avgProcessingLatencyMs: avgLatencyMs != null ? Math.round(avgLatencyMs) : null,
      totalDocs,
      processedDocs,
      topFailureReasons,
      usageStats: {
        docsProcessed: docsProcessedUsage,
        duplicateDetected: duplicateFromUsage,
      },
      perFirmBreakdown: perFirmData,
      firms: firms.map((f) => ({ id: f.id, name: f.name })),
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
    };
    if (timeSeries) body.timeSeries = timeSeries;
    res.json(body);
  } catch (e) {
    next(e);
  }
});

// Admin demo seed: creates firm, cases, documents, timeline (dev only; in prod requires authApiKey)
// In non-production: bypasses auth, uses first firm or creates one (no DOC_API_KEY needed)
// Supports dryRun: true (returns created counts without writing)
function splitDemoName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: null, lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

app.post("/admin/demo/seed", async (req, res) => {
  const body = (req.body ?? {}) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;
  try {
    console.log("[DEMO SEED] running seed handler", { ts: new Date().toISOString(), dryRun });
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      return res.status(403).json({ ok: false, error: "Demo seed disabled in production" });
    }

    let firmId: string;
    if (isProd) {
      const token = (req.headers.authorization || req.headers.Authorization || "")?.toString().match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <apiKey>" });
      const prefix = token.slice(0, 12);
      const candidates = await prisma.apiKey.findMany({ where: { keyPrefix: prefix, revokedAt: null }, take: 5 });
      let resolvedFirmId: string | null = null;
      for (const k of candidates) {
        if (await bcrypt.compare(token, k.keyHash)) {
          resolvedFirmId = k.firmId;
          break;
        }
      }
      if (!resolvedFirmId) return res.status(401).json({ ok: false, error: "Invalid API key" });
      firmId = resolvedFirmId;
    } else {
      let firm = await prisma.firm.findFirst({ orderBy: { createdAt: "asc" } });
      if (!firm) {
        if (dryRun) {
          return res.json({
            ok: true,
            dryRun: true,
            wouldCreate: { firms: 1, cases: 3, documents: 10, timelineEvents: 8 },
          });
        }
        const createdFirm = await createFirmWithDefaults({ name: "Demo Firm" });
        console.log("[DEMO SEED] created firm:", createdFirm.id);
        firmId = createdFirm.id;
      } else {
        firmId = firm.id;
      }
    }

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        wouldCreate: { firms: 0, cases: 3, documents: 10, timelineEvents: 8 },
      });
    }

    // Clear existing demo data for this firm (delete in FK order)
    const { rows: caseRows } = await pgPool.query<{ id: string }>('SELECT id FROM "Case" WHERE "firmId" = $1', [firmId]);
    const caseIds = caseRows.map((r) => r.id);
    const existingDocs = await prisma.document.findMany({ where: { firmId }, select: { id: true } });
    const docIds = existingDocs.map((d) => d.id);

    // 1. CaseTimelineEvent references Case + Document
    await prisma.caseTimelineEvent.deleteMany({ where: { firmId } });
    await prisma.caseTimelineRebuild.deleteMany({ where: { firmId } });
    // 2. RecordsRequest references Case
    if (caseIds.length > 0) {
      await prisma.recordsRequest.deleteMany({ where: { caseId: { in: caseIds } } });
    }
    // 3. CrmPushLog references Case; CrmCaseMapping references Case
    await prisma.crmPushLog.deleteMany({ where: { firmId } });
    await prisma.crmCaseMapping.deleteMany({ where: { firmId } });
    // 4. DocumentAuditEvent references Document
    if (docIds.length > 0) {
      await prisma.documentAuditEvent.deleteMany({ where: { documentId: { in: docIds } } });
    }
    // 5. Document
    await prisma.document.deleteMany({ where: { firmId } });
    // 6. Current Case model is in sync with Prisma; delete via Prisma instead of raw SQL.
    await prisma.legalCase.deleteMany({ where: { firmId } });

    if (docIds.length > 0) {
      try {
        await pgPool.query("DELETE FROM document_recognition WHERE document_id = ANY($1)", [docIds]);
      } catch {}
    }

    const now = new Date();
    // Create 3 cases with stable ids for demo
    const caseId1 = "demo-case-1";
    const caseId2 = "demo-case-2";
    const caseId3 = "demo-case-3";
    const demoCases = [
      { id: caseId1, caseNumber: "DEMO-001", title: "Smith v. State Farm", clientName: "Alice Smith" },
      { id: caseId2, caseNumber: "DEMO-002", title: "Jones Medical Records", clientName: "Bob Jones" },
      { id: caseId3, caseNumber: "DEMO-003", title: "Wilson PI Claim", clientName: "Carol Wilson" },
    ];
    for (let i = 0; i < demoCases.length; i++) {
      const item = demoCases[i];
      const contactId = `demo-contact-${i + 1}`;
      const { firstName, lastName } = splitDemoName(item.clientName);
      await prisma.contact.upsert({
        where: { id: contactId },
        create: {
          id: contactId,
          firmId,
          firstName,
          lastName,
          fullName: item.clientName,
        },
        update: {
          firmId,
          firstName,
          lastName,
          fullName: item.clientName,
        },
      });
      await prisma.legalCase.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          firmId,
          title: item.title,
          caseNumber: item.caseNumber,
          clientName: item.clientName,
          clientContactId: contactId,
          status: "open",
          createdAt: now,
        },
        update: {
          firmId,
          title: item.title,
          caseNumber: item.caseNumber,
          clientName: item.clientName,
          clientContactId: contactId,
          status: "open",
        },
      });
    }
    // Map display case numbers to real case IDs so suggestedCaseId links correctly to /cases/:id
    const toSuggestedCaseId = (cn: string | null): string | null =>
      cn === "DEMO-001" ? caseId1 : cn === "DEMO-002" ? caseId2 : cn === "DEMO-003" ? caseId3 : null;
    const docData: Array<{
      status: "UPLOADED" | "NEEDS_REVIEW";
      routedCaseId: string | null;
      routedSystem: string | null;
      confidence: number | null;
      caseNumber: string | null;
      clientName: string | null;
      hasOffer: boolean;
      hasMatch: boolean;
    }> = [
      { status: "UPLOADED", routedCaseId: caseId1, routedSystem: "manual", confidence: 0.95, caseNumber: "DEMO-001", clientName: "Alice Smith", hasOffer: true, hasMatch: false },
      { status: "UPLOADED", routedCaseId: caseId2, routedSystem: "manual", confidence: 0.88, caseNumber: "DEMO-002", clientName: "Bob Jones", hasOffer: true, hasMatch: false },
      { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.92, caseNumber: "DEMO-003", clientName: "Carol Wilson", hasOffer: false, hasMatch: true },
      { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.75, caseNumber: "DEMO-001", clientName: "Alice Smith", hasOffer: false, hasMatch: true },
      { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.65, caseNumber: null, clientName: null, hasOffer: false, hasMatch: false },
      { status: "UPLOADED", routedCaseId: caseId3, routedSystem: "manual", confidence: 0.90, caseNumber: "DEMO-003", clientName: "Carol Wilson", hasOffer: true, hasMatch: false },
      { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.80, caseNumber: "DEMO-002", clientName: "Bob Jones", hasOffer: false, hasMatch: true },
      { status: "UPLOADED", routedCaseId: caseId1, routedSystem: "manual", confidence: 0.85, caseNumber: "DEMO-001", clientName: "Alice Smith", hasOffer: false, hasMatch: false },
      { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.70, caseNumber: null, clientName: "Grace Hill", hasOffer: false, hasMatch: false },
      { status: "UPLOADED", routedCaseId: caseId2, routedSystem: "manual", confidence: 0.92, caseNumber: "DEMO-002", clientName: "Bob Jones", hasOffer: false, hasMatch: false },
    ];

    await ensureDemoSeedObjects(
      docData.map((d, index) => ({
        spacesKey: `demo/seed-${index + 1}.pdf`,
        originalName: `demo-doc-${index + 1}.pdf`,
        caseNumber: d.caseNumber,
        clientName: d.clientName,
        routedCaseId: d.routedCaseId,
        status: d.status,
        hasOffer: d.hasOffer,
      }))
    );

    const createdDocIds: string[] = [];
    for (let i = 0; i < docData.length; i++) {
      const d = docData[i];
      const doc = await prisma.document.create({
        data: {
          firmId,
          source: "demo-seed",
          spacesKey: `demo/seed-${i + 1}.pdf`,
          originalName: `demo-doc-${i + 1}.pdf`,
          mimeType: "application/pdf",
          pageCount: 1,
          status: d.status,
          routedCaseId: d.routedCaseId,
          routedSystem: d.routedSystem,
          confidence: d.confidence,
          extractedFields: d.caseNumber || d.clientName ? ({ caseNumber: d.caseNumber, clientName: d.clientName } as Prisma.InputJsonValue) : undefined,
          processedAt: d.status === "UPLOADED" ? now : null,
        },
      });
      createdDocIds.push(doc.id);

      try {
        const matchConf = d.hasMatch && d.caseNumber ? 0.85 : null;
        const matchReason = d.hasMatch && d.caseNumber ? "Case number match" : null;
        const insFields = d.hasOffer ? JSON.stringify({ settlementOffer: 50000 }) : null;
        const suggestedCaseId = toSuggestedCaseId(d.caseNumber);
        await pgPool.query(
          `INSERT INTO document_recognition (document_id, case_number, client_name, suggested_case_id, confidence, match_confidence, match_reason, insurance_fields, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (document_id) DO UPDATE SET
             case_number = EXCLUDED.case_number,
             client_name = EXCLUDED.client_name,
             suggested_case_id = EXCLUDED.suggested_case_id,
             confidence = EXCLUDED.confidence,
             match_confidence = EXCLUDED.match_confidence,
             match_reason = EXCLUDED.match_reason,
             insurance_fields = COALESCE(EXCLUDED.insurance_fields, document_recognition.insurance_fields),
             updated_at = now()`,
          [doc.id, d.caseNumber ?? null, d.clientName ?? null, suggestedCaseId, d.confidence ?? 0.5, matchConf, matchReason, insFields]
        );
      } catch (e) {
        console.warn("[demo/seed] document_recognition insert failed:", e);
      }
    }

    // 8 timeline events (createdDocIds has 10 elements; we need indices 0,1,2,5,7)
    const timelineDocs = createdDocIds.slice(0, 8);
    await prisma.caseTimelineEvent.createMany({
      data: [
        { caseId: caseId1, firmId, eventDate: now, eventType: "records_received", track: "medical", provider: "Demo Provider", documentId: timelineDocs[0] },
        { caseId: caseId1, firmId, eventDate: now, eventType: "records_received", track: "medical", provider: "Demo Provider", documentId: timelineDocs[7] },
        { caseId: caseId2, firmId, eventDate: now, eventType: "records_received", track: "medical", provider: "Demo Provider", documentId: timelineDocs[1] },
        { caseId: caseId2, firmId, eventDate: now, eventType: "settlement_offer", track: "insurance", amount: "50000", documentId: timelineDocs[1] },
        { caseId: caseId2, firmId, eventDate: now, eventType: "records_received", track: "medical", documentId: timelineDocs[5] },
        { caseId: caseId3, firmId, eventDate: now, eventType: "records_received", track: "medical", provider: "Demo Provider", documentId: timelineDocs[2] },
        { caseId: caseId3, firmId, eventDate: now, eventType: "records_received", track: "insurance", documentId: timelineDocs[5] },
        { caseId: caseId3, firmId, eventDate: now, eventType: "diagnosis", track: "medical", diagnosis: "Demo diagnosis", documentId: timelineDocs[2] },
      ],
    });

    res.json({
      ok: true,
      firmId,
      caseIds: [caseId1, caseId2, caseId3],
      documentIds: createdDocIds,
      created: { firms: 0, cases: 3, documents: createdDocIds.length, timelineEvents: 8 },
    });
  } catch (e: any) {
    console.error("[admin/demo/seed]", e);
    logSystemError("demo-seed", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// TEMP dev route: create a firm
app.post("/dev/create-firm", requireNonProductionDevRoute, auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const firm = await createFirmWithDefaults({ name: String(name) });
  res.json(firm);
});

// TEMP dev route: create an API key for a firm (shows secret once)
// Dev-only: create API key for first/only firm (no auth, no firmId needed)
app.post("/admin/dev/create-api-key", requireNonProductionDevRoute, auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  let firm = await prisma.firm.findFirst({ orderBy: { createdAt: "asc" } });
  let firmId = firm?.id ?? null;
  if (!firm) {
    const createdFirm = await createFirmWithDefaults({ name: "Demo Firm" });
    firmId = createdFirm.id;
  } else {
    firmId = firm.id;
  }
  if (!firmId) return res.status(500).json({ ok: false, error: "Failed to resolve firm" });
  const name = (req.body as { name?: string })?.name ?? "Dev API Key";
  const rawKey = "sk_live_" + crypto.randomBytes(24).toString("hex");
  const keyHash = await bcrypt.hash(rawKey, 10);

  await prisma.apiKey.create({
    data: {
      firmId,
      name,
      keyPrefix: rawKey.slice(0, 12),
      keyHash,
    },
  });

  console.log("[admin/dev/create-api-key] apiKey:", rawKey);
  return res.json({ ok: true, apiKey: rawKey, firmId });
});

app.post("/dev/create-api-key/:firmId", requireNonProductionDevRoute, auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  const firmId = String(req.params.firmId ?? "");
  const { name } = req.body ?? {};
  if (!firmId) return res.status(400).json({ error: "firmId is required" });
  if (!name) return res.status(400).json({ error: "name is required" });

  const rawKey = "sk_live_" + crypto.randomBytes(24).toString("hex");
  const keyHash = await bcrypt.hash(rawKey, 10);

  await prisma.apiKey.create({
    data: {
      firmId,
      name,
      keyPrefix: rawKey.slice(0, 12),
      keyHash,
    },
  });

  res.json({
    message: "SAVE THIS KEY NOW. It will not be shown again.",
    apiKey: rawKey,
  });
});

// Ingest (API key protected)
app.post("/ingest", authWithScope("ingest"), rateLimitEndpoint(60, "ingest"), upload.single("file"), async (req, res) => {
  const firmId = (req as any).firmId as string;
  const file = req.file;
  const source = (req.body?.source as string) || "upload";
  const externalId = req.body?.externalId ? String(req.body.externalId) : null;

  if (!file) return res.status(400).json({ error: "Missing file (multipart field name must be 'file')" });

  const docLimitCheck = await canIngestDocument(firmId);
  if (!docLimitCheck.allowed) {
    return res.status(402).json({
      ok: false,
      error: docLimitCheck.error,
      billingStatus: docLimitCheck.billingStatus,
      billing: buildUploadBillingPayload(docLimitCheck),
    });
  }

  const fileSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const fileSizeBytes = file.buffer.length;

  const duplicatesEnabled = await hasFeature(firmId, "duplicates_detection");
  if (duplicatesEnabled) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existing = await prisma.document.findFirst({
      where: {
        firmId,
        file_sha256: fileSha256,
        fileSizeBytes,
        ingestedAt: { gte: since },
      },
      orderBy: { ingestedAt: "desc" },
      select: { id: true, spacesKey: true },
    });

    if (existing) {
      const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
      await prisma.usageMonthly.upsert({
        where: { firmId_yearMonth: { firmId, yearMonth: ym } },
        create: {
          firmId,
          yearMonth: ym,
          pagesProcessed: 0,
          docsProcessed: 0,
          insuranceDocsExtracted: 0,
          courtDocsExtracted: 0,
          narrativeGenerated: 0,
          duplicateDetected: 1,
        },
        update: { duplicateDetected: { increment: 1 } },
      });
      await prisma.document.updateMany({
        where: { id: existing.id, firmId },
        data: { duplicateMatchCount: { increment: 1 } },
      });

      const doc = await prisma.document.create({
        data: {
          firmId,
          source,
          spacesKey: existing.spacesKey,
          originalName: file.originalname,
          mimeType: file.mimetype || "application/octet-stream",
          pageCount: 0,
          status: "UPLOADED",
          processingStage: "complete",
          external_id: externalId ?? null,
          file_sha256: fileSha256,
          fileSizeBytes,
          duplicateOfId: existing.id,
          ingestedAt: new Date(),
          processedAt: new Date(),
        },
      });

      return res.json({
        ok: true,
        duplicate: true,
        documentId: doc.id,
        existingId: existing.id,
        spacesKey: existing.spacesKey,
        billing: buildUploadBillingPayload(docLimitCheck),
      });
    }
  }

  const documentId = crypto.randomUUID();
  const key = buildDocumentStorageKey({
    firmId,
    caseId: null,
    documentId,
    originalName: file.originalname,
  });

  await putObject(key, file.buffer, file.mimetype || "application/octet-stream");

  const doc = await prisma.document.create({
    data: {
      id: documentId,
      firmId,
      source,
      spacesKey: key,
      originalName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      pageCount: 0,
      status: "RECEIVED",
      external_id: externalId ?? null,
      file_sha256: fileSha256,
      fileSizeBytes,
      ingestedAt: new Date(),
    },
  });

  await enqueueDocumentJob({ documentId: doc.id, firmId });

  res.json({ ok: true, documentId: doc.id, spacesKey: key, billing: buildUploadBillingPayload(docLimitCheck) });
});

const handleBulkIngestUpload: express.RequestHandler = (req, res) => {
  upload.array("files", 20)(req, res, async (uploadError: unknown) => {
    if (uploadError instanceof multer.MulterError) {
      if (uploadError.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          ok: false,
          code: "PAYLOAD_TOO_LARGE",
          error: "Each upload must be 25MB or smaller.",
        });
      }
      return res.status(400).json({
        ok: false,
        code: uploadError.code,
        error: uploadError.message,
      });
    }
    if (uploadError) {
      return res.status(500).json({
        ok: false,
        error: String((uploadError as Error)?.message ?? uploadError),
      });
    }

    try {
      const firmId = (req as any).firmId as string;
      const files = ((req.files as Express.Multer.File[] | undefined) ?? []).filter((file) =>
        Buffer.isBuffer(file.buffer)
      );
      if (files.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "Upload at least one file in the files field.",
        });
      }

      const docLimitCheck = await canIngestDocument(firmId);
      if (!docLimitCheck.allowed) {
        return res.status(402).json({
          ok: false,
          error: docLimitCheck.error,
          billingStatus: docLimitCheck.billingStatus,
          billing: buildUploadBillingPayload(docLimitCheck),
        });
      }

      const source =
        typeof req.body?.source === "string" && req.body.source.trim().length > 0
          ? req.body.source.trim()
          : "web";

      const documentIds: string[] = [];
      const duplicateIndices: number[] = [];
      const errors: Array<{ file: string; error: string; code?: string }> = [];

      for (const [index, file] of files.entries()) {
        try {
          const result = await ingestUploadedFile({
            firmId,
            file,
            source,
          });
          documentIds.push(result.documentId);
          if (result.duplicate) {
            duplicateIndices.push(index);
          }
        } catch (error) {
          errors.push({
            file: file.originalname,
            error: String((error as Error)?.message ?? error),
          });
        }
      }

      return res.json({
        ok: true,
        documentIds,
        duplicatesDetected: duplicateIndices.length,
        duplicateIndices,
        errors,
        billing: buildUploadBillingPayload(docLimitCheck),
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: String((error as Error)?.message ?? error),
      });
    }
  });
};

const handleBulkIngestMethodNotAllowed: express.RequestHandler = (_req, res) => {
  res.status(405).json({
    ok: false,
    code: "METHOD_NOT_ALLOWED",
    error: "Use POST multipart/form-data with one or more files in the files field.",
  });
};

app.post("/me/ingest/bulk", auth, requireRole(Role.STAFF), handleBulkIngestUpload);
app.post("/api/me/ingest/bulk", auth, requireRole(Role.STAFF), handleBulkIngestUpload);
app.all("/me/ingest/bulk", auth, requireRole(Role.STAFF), handleBulkIngestMethodNotAllowed);
app.all("/api/me/ingest/bulk", auth, requireRole(Role.STAFF), handleBulkIngestMethodNotAllowed);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
// === Firm-scoped endpoints ===

// Audit events list for dashboard /dashboard/audit
app.get("/me/audit-events", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const events = await prisma.documentAuditEvent.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        documentId: true,
        actor: true,
        action: true,
        fromCaseId: true,
        toCaseId: true,
        metaJson: true,
        createdAt: true,
      },
    });
    res.json({
      ok: true,
      items: events.map((e) => ({
        id: e.id,
        documentId: e.documentId,
        actor: e.actor,
        action: e.action,
        fromCaseId: e.fromCaseId,
        toCaseId: e.toCaseId,
        metaJson: e.metaJson,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/me/clio-handoff-audit", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const outcomeFilter = typeof req.query.outcomeType === "string" && req.query.outcomeType.trim()
      ? req.query.outcomeType.trim()
      : null;
    const allowedOutcomeFilter = outcomeFilter && clioHandoffAuditOutcomeTypes.includes(outcomeFilter as ClioHandoffAuditOutcomeType)
      ? (outcomeFilter as ClioHandoffAuditOutcomeType)
      : null;

    const where: Prisma.SystemErrorLogWhereInput = {
      firmId,
      area: "clio_handoff_audit",
    };
    if (allowedOutcomeFilter) {
      where.metaJson = { path: ["outcomeType"], equals: allowedOutcomeFilter };
    }

    const logs = await prisma.systemErrorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        metaJson: true,
      },
    });

    const items: ClioHandoffAuditReviewItem[] = logs.map((entry) => {
      const meta = (entry.metaJson ?? {}) as Record<string, unknown>;
      const outcomeValue = typeof meta.outcomeType === "string" ? meta.outcomeType : "unknown";
      const outcomeType = clioHandoffAuditOutcomeTypes.includes(outcomeValue as ClioHandoffAuditOutcomeType)
        ? (outcomeValue as ClioHandoffAuditOutcomeType)
        : "unknown";
      return {
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        outcomeType,
        batchId: typeof meta.batchId === "string" ? meta.batchId : null,
        handoffExportId: typeof meta.handoffExportId === "string" ? meta.handoffExportId : null,
        hasIdempotencyKey: typeof meta.hasIdempotencyKey === "boolean" ? meta.hasIdempotencyKey : false,
        reason: typeof meta.reason === "string" ? meta.reason : null,
      };
    });

    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Notifications (key events: settlement offer, timeline updated, narrative generated)
app.get("/me/notifications", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 30, 100);
    const unreadOnly = req.query.unread === "true";
    const items = await listNotifications(firmId, { limit, unreadOnly });
    const unreadCount = await getUnreadCount(firmId);
    res.json({
      ok: true,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        meta: n.meta,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/me/notifications/:id/read", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const ok = await markNotificationRead(firmId, id);
    if (!ok) return res.status(404).json({ ok: false, error: "Notification not found" });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/me/notifications/read-all", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { firmId?: string };
    if (body.firmId && body.firmId !== firmId) {
      return res.status(403).json({ ok: false, error: "firmId mismatch" });
    }
    const count = await markAllNotificationsRead(firmId);
    res.json({ ok: true, markedCount: count });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Recent activity feed for dashboard
app.get("/activity-feed", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(Math.max(1, parseInt(String(limitRaw ?? "10"), 10) || 10), 50);

    const items = await prisma.activityFeedItem.findMany({
      where: { firmId },
      select: {
        id: true,
        caseId: true,
        documentId: true,
        type: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      ok: true,
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("Failed to get activity feed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Queue status summary for dashboard
app.get("/me/queue-status", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const [db, documentPipelinePending] = await Promise.all([
      getJobCounts(firmId),
      prisma.document.count({
        where: {
          firmId,
          processingStage: { not: "complete" },
        },
      }),
    ]);

    res.json({
      ok: true,
      db: {
        queued: db.queued,
        running: db.running,
        failed: db.failed,
      },
      documentPipelinePending,
    });
  } catch (e: any) {
    console.error("Failed to get queue status", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Metrics summary: single fast endpoint for dashboard counters (firm-scoped)
app.get("/me/metrics-summary", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const trendStart = new Date(monthStart);
    trendStart.setUTCDate(trendStart.getUTCDate() - 30);

    const [usageRow, unmatchedCount, needsReviewCount, recordsThisMonth, unreadCount] = await Promise.all([
      prisma.usageMonthly.findUnique({
        where: { firmId_yearMonth: { firmId, yearMonth: ym } },
        select: { docsProcessed: true, pagesProcessed: true },
      }),
      prisma.document.count({ where: { firmId, status: "UNMATCHED" } }),
      prisma.document.count({
        where: {
          firmId,
          OR: [
            { reviewState: "IN_REVIEW" },
            {
              reviewState: null,
              status: { in: ["NEEDS_REVIEW", "UPLOADED"] },
              OR: [{ routingStatus: null }, { routingStatus: "needs_review" }],
            },
          ],
        },
      }),
      prisma.recordsRequest.count({
        where: { firmId, createdAt: { gte: monthStart, lte: monthEnd } },
      }),
      getUnreadCount(firmId),
    ]);

    // 30-day trend: docs and records per day (simple sparkline data)
    const [docsByDay, recordsByDay] = await Promise.all([
      pgPool.query<{ day: string; count: string }>(
        `select to_char(date("processedAt"), 'YYYY-MM-DD') as day, count(*)::int as count
         from "Document"
         where "firmId" = $1 and "processedAt" is not null
           and "processedAt" >= $2 and "processedAt" <= $3
         group by date("processedAt")
         order by day`,
        [firmId, trendStart, monthEnd]
      ),
      pgPool.query<{ day: string; count: string }>(
        `select to_char(date("createdAt"), 'YYYY-MM-DD') as day, count(*)::int as count
         from "RecordsRequest"
         where "firmId" = $1
           and "createdAt" >= $2 and "createdAt" <= $3
         group by date("createdAt")
         order by day`,
        [firmId, trendStart, monthEnd]
      ),
    ]);

    const docsMap = new Map(docsByDay.rows.map((r) => [String(r.day), Number(r.count)]));
    const recordsMap = new Map(recordsByDay.rows.map((r) => [String(r.day), Number(r.count)]));
    const trend: { day: string; docsProcessed: number; recordsRequests: number }[] = [];
    for (let d = new Date(trendStart); d <= monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const dayStr = d.toISOString().slice(0, 10);
      trend.push({
        day: dayStr,
        docsProcessed: docsMap.get(dayStr) ?? 0,
        recordsRequests: recordsMap.get(dayStr) ?? 0,
      });
    }

    res.json({
      ok: true,
      summary: {
        docsProcessedThisMonth: usageRow?.docsProcessed ?? 0,
        pagesProcessedThisMonth: usageRow?.pagesProcessed ?? 0,
        unmatchedDocs: unmatchedCount,
        needsReviewDocs: needsReviewCount,
        recordsRequestsCreatedThisMonth: recordsThisMonth,
        notificationsUnread: unreadCount,
      },
      trend,
    });
  } catch (e: any) {
    console.error("Failed to get metrics summary", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Overdue tasks (for dedicated overdue-tasks page)
app.get("/me/overdue-tasks", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const now = new Date();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const tasks = await prisma.caseTask.findMany({
      where: {
        firmId,
        completedAt: null,
        dueDate: { lt: now },
      },
      select: { id: true, title: true, dueDate: true, caseId: true },
      orderBy: { dueDate: "asc" },
      take: limit,
    });
    res.json({ ok: true, items: tasks });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Needs Attention: actionable items for dashboard (firm-scoped where applicable)
app.get("/me/needs-attention", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const now = new Date();

    const [unmatchedDocs, failedDocs, overdueTasks, recordsWithFailedAttempts, systemErrors] = await Promise.all([
      prisma.document.findMany({
        where: { firmId, status: "UNMATCHED" },
        select: { id: true, originalName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.document.findMany({
        where: { firmId, status: "FAILED" },
        select: { id: true, originalName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.caseTask.findMany({
        where: {
          firmId,
          completedAt: null,
          dueDate: { lt: now },
        },
        select: { id: true, title: true, dueDate: true, caseId: true },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      prisma.recordsRequest.findMany({
        where: {
          firmId,
          attempts: {
            some: { ok: false },
          },
        },
        select: {
          id: true,
          providerName: true,
          caseId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.systemErrorLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, service: true, message: true, createdAt: true },
      }),
    ]);

    const [unmatchedCount, failedCount, overdueCount, recordsNeedingFollowUpCount, systemErrorCount] = await Promise.all([
      prisma.document.count({ where: { firmId, status: "UNMATCHED" } }),
      prisma.document.count({ where: { firmId, status: "FAILED" } }),
      prisma.caseTask.count({
        where: { firmId, completedAt: null, dueDate: { lt: now } },
      }),
      prisma.recordsRequest.count({
        where: {
          firmId,
          attempts: { some: { ok: false } },
        },
      }),
      prisma.systemErrorLog.count(),
    ]);

    res.json({
      ok: true,
      unmatchedDocuments: {
        count: unmatchedCount,
        items: unmatchedDocs.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          createdAt: d.createdAt.toISOString(),
        })),
      },
      failedDocuments: {
        count: failedCount,
        items: failedDocs.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          createdAt: d.createdAt.toISOString(),
        })),
      },
      overdueCaseTasks: {
        count: overdueCount,
        items: overdueTasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate?.toISOString() ?? null,
          caseId: t.caseId,
        })),
      },
      recordsRequestsNeedingFollowUp: {
        count: recordsNeedingFollowUpCount,
        items: recordsWithFailedAttempts.map((r) => ({
          id: r.id,
          providerName: r.providerName,
          caseId: r.caseId,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      systemErrors: {
        count: systemErrorCount,
        items: systemErrors.map((e) => ({
          id: e.id,
          service: e.service,
          message: e.message,
          createdAt: e.createdAt.toISOString(),
        })),
      },
    });
  } catch (e: any) {
    console.error("Failed to get needs-attention", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Overdue tasks (for dashboard overdue-tasks page)
app.get("/me/overdue-tasks", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const now = new Date();
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(Math.max(1, parseInt(String(limitRaw ?? "100"), 10) || 100), 200);

    const tasks = await prisma.caseTask.findMany({
      where: { firmId, completedAt: null, dueDate: { lt: now } },
      select: { id: true, title: true, dueDate: true, caseId: true },
      orderBy: { dueDate: "asc" },
      take: limit,
    });

    res.json({
      ok: true,
      items: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate?.toISOString() ?? null,
        caseId: t.caseId,
      })),
      count: tasks.length,
    });
  } catch (e: any) {
    console.error("Failed to get overdue tasks", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Current month usage + firm plan info (all UsageMonthly counters for metering)
app.get("/me/usage", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const monthsParam = Array.isArray(req.query.months) ? req.query.months[0] : req.query.months;
    const monthsCount = Math.min(Math.max(parseInt(String(monthsParam ?? "0"), 10) || 0, 0), 24);

    const snapshot = await getFirmBillingUsageSnapshot(firmId);
    if (!snapshot) return res.status(404).json({ ok: false, error: "Firm not found" });

    let usageByMonth: Array<{
      yearMonth: string;
      pagesProcessed: number;
      docsProcessed: number;
      insuranceDocsExtracted: number;
      courtDocsExtracted: number;
      narrativeGenerated: number;
      duplicateDetected: number;
    }> = [];
    if (monthsCount > 0) {
      const rows = await prisma.usageMonthly.findMany({
        where: { firmId },
        orderBy: { yearMonth: "desc" },
        take: monthsCount,
        select: {
          yearMonth: true,
          pagesProcessed: true,
          docsProcessed: true,
          insuranceDocsExtracted: true,
          courtDocsExtracted: true,
          narrativeGenerated: true,
          duplicateDetected: true,
        },
      });
      usageByMonth = rows.map((r) => ({
        yearMonth: r.yearMonth,
        pagesProcessed: r.pagesProcessed,
        docsProcessed: r.docsProcessed,
        insuranceDocsExtracted: r.insuranceDocsExtracted,
        courtDocsExtracted: r.courtDocsExtracted,
        narrativeGenerated: r.narrativeGenerated,
        duplicateDetected: r.duplicateDetected,
      }));
    }

    res.json({
      ok: true,
      period: snapshot.period,
      firm: {
        id: snapshot.firm.id,
        name: snapshot.firm.name,
        plan: snapshot.firm.plan,
        rawPlan: snapshot.firm.rawPlan,
        pageLimitMonthly: snapshot.plan.documentLimitMonthly,
        documentLimitMonthly: snapshot.plan.documentLimitMonthly,
        retentionDays: snapshot.firm.retentionDays,
        status: snapshot.firm.status,
        billingStatus: snapshot.firm.billingStatus,
        trialEndsAt: snapshot.firm.trialEndsAt,
      },
      plan: snapshot.plan,
      usage: snapshot.usage,
      enforcement: snapshot.enforcement,
      ...(usageByMonth.length > 0 ? { usageByMonth } : {}),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/billing/plans", auth, requireRole(Role.STAFF), async (_req, res) => {
  try {
    res.json({
      ok: true,
      plans: listPlansForDisplay(),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/me/billing", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        name: true,
        plan: true,
        billingStatus: true,
        billingCustomerId: true,
        settings: true,
      },
    });
    if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

    const settings =
      firm.settings && typeof firm.settings === "object" && !Array.isArray(firm.settings)
        ? (firm.settings as Record<string, unknown>)
        : null;
    const billingEmail =
      typeof settings?.billingEmail === "string" && settings.billingEmail.trim()
        ? settings.billingEmail.trim()
        : null;

    res.json({
      ok: true,
      firmName: firm.name,
      billing: {
        plan: normalizeBillingPlanSlug(firm.plan),
        status: firm.billingStatus,
        subscriptionStatus: firm.billingStatus,
        billingEmail,
        stripeCustomerId: firm.billingCustomerId ?? null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/billing/plans", auth, requireRole(Role.STAFF), async (_req, res) => {
  try {
    res.json({
      ok: true,
      plans: listPlansForDisplay(),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Billing status (plan, usage, limit, status, trial end)
app.get("/billing/status", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const snapshot = await getFirmBillingUsageSnapshot(firmId);
    if (!snapshot) return res.status(404).json({ ok: false, error: "Firm not found" });

    res.json({ ok: true, ...snapshot });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Dev-only: simulate upgrade (plan, pageLimitMonthly, billingStatus)
app.post("/billing/simulate/upgrade", auth, requireRole(Role.STAFF), async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { plan?: string; pageLimitMonthly?: number; billingStatus?: string };

    const data: { plan?: string; pageLimitMonthly?: number; billingStatus?: string } = {};
    if (typeof body.plan === "string" && body.plan.trim()) {
      const plan = normalizePlanSlug(body.plan);
      data.plan = plan;
      data.pageLimitMonthly = getPlanMetadata(plan).docLimitMonthly;
    }
    if (typeof body.pageLimitMonthly === "number" && body.pageLimitMonthly >= 0) data.pageLimitMonthly = body.pageLimitMonthly;
    if (typeof body.billingStatus === "string" && body.billingStatus.trim()) data.billingStatus = body.billingStatus.trim();

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, error: "Provide plan, pageLimitMonthly, or billingStatus" });
    }

    const firm = await prisma.firm.update({
      where: { id: firmId },
      data,
      select: { id: true, plan: true, pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
    });
    res.json({ ok: true, firm });
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ ok: false, error: "Firm not found" });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Firm usage (current month + limit) - alias for plan enforcement
app.get("/firm/usage", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const snapshot = await getFirmBillingUsageSnapshot(firmId);
    if (!snapshot) return res.status(404).json({ ok: false, error: "Firm not found" });

    res.json({ ok: true, ...snapshot });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Latest documents (cursor pagination)
app.get("/me/documents", auth, requireRole(Role.STAFF), async (req, res) => {
  const firmId = (req as any).firmId as string;
  const authRole = (req as any).authRole as Role | undefined;

  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
  const statusRaw = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
  const caseSearchRaw = Array.isArray(req.query.caseId) ? req.query.caseId[0] : req.query.caseId;

  const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "25"), 10) || 25, 1), 100);
  const cursor = cursorRaw ? String(cursorRaw) : null;
  const status = typeof statusRaw === "string" && statusRaw.trim() ? statusRaw.trim().toUpperCase() : null;
  const caseSearch = typeof caseSearchRaw === "string" && caseSearchRaw.trim() ? caseSearchRaw.trim() : null;
  const validDocumentStatuses = new Set<DocumentStatus>([
    DocumentStatus.RECEIVED,
    DocumentStatus.PROCESSING,
    DocumentStatus.NEEDS_REVIEW,
    DocumentStatus.UPLOADED,
    DocumentStatus.FAILED,
    DocumentStatus.UNMATCHED,
  ]);

  if (status && !validDocumentStatuses.has(status as DocumentStatus)) {
    return res.status(400).json({ ok: false, error: "Invalid document status filter" });
  }

  let routedCaseIds: string[] | null = null;
  if (caseSearch) {
    const matchingCases = await prisma.legalCase.findMany({
      where: {
        firmId,
        OR: [
          { id: caseSearch },
          { title: { contains: caseSearch, mode: "insensitive" } },
          { caseNumber: { contains: caseSearch, mode: "insensitive" } },
          { clientName: { contains: caseSearch, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    routedCaseIds = Array.from(new Set([caseSearch, ...matchingCases.map((item) => item.id)]));
  }

  const docs = await prisma.document.findMany({
    where: {
      firmId,
      ...(status ? { status: status as DocumentStatus } : {}),
      ...(routedCaseIds ? { routedCaseId: { in: routedCaseIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      source: true,
      originalName: true,
      mimeType: true,
      pageCount: true,
      status: true,
      spacesKey: true,
      routedCaseId: true,
      createdAt: true,
      processedAt: true,
      routingStatus: true,
      duplicateMatchCount: true,
      duplicateOfId: true,
      processingStage: true,
    },
  });

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const normalizedStatusById = await normalizeLegacyDocumentStatuses(firmId, page);
  const visiblePage = await filterVisibleDemandPackageDocuments(firmId, authRole, page);
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  const docIds = visiblePage.map((d: { id: string }) => d.id);

  const lastAudit =
    docIds.length > 0
      ? await prisma.documentAuditEvent.findMany({
          where: { documentId: { in: docIds }, firmId },
          orderBy: { createdAt: "desc" },
        })
      : [];
  const lastAuditByDoc = new Map<string, string>();
  for (const e of lastAudit) {
    if (!lastAuditByDoc.has(e.documentId)) lastAuditByDoc.set(e.documentId, e.action);
  }

  const recRows =
    docIds.length > 0
      ? await pgPool.query<{
          document_id: string;
          insurance_fields: unknown;
          court_fields: unknown;
          match_confidence: unknown;
          match_reason: unknown;
          insights: unknown;
          summary: unknown;
        }>(
          `select document_id, insurance_fields, court_fields, match_confidence, match_reason, insights, summary from document_recognition where document_id = any($1)`,
          [docIds]
        )
      : { rows: [] as { document_id: string; insurance_fields: unknown; court_fields: unknown; match_confidence: unknown; match_reason: unknown; insights: unknown; summary: unknown }[] };
  const insuranceByDoc = new Map<string, { settlementOffer?: number | null } | null>();
  const recognitionByDoc = new Map<
    string,
    {
      matchConfidence: number | null;
      matchReason: string | null;
      insuranceFields: unknown;
      courtFields: unknown;
      insights: unknown[] | null;
      summary: string | null;
    } | null
  >();
  for (const r of recRows.rows) {
    const raw = r.insurance_fields;
    if (raw != null && typeof raw === "object" && "settlementOffer" in raw) {
      const v = (raw as { settlementOffer?: unknown }).settlementOffer;
      insuranceByDoc.set(r.document_id, {
        settlementOffer: typeof v === "number" && Number.isFinite(v) ? v : null,
      });
    } else {
      insuranceByDoc.set(r.document_id, null);
    }
    const insights =
      r.insights != null
        ? Array.isArray(r.insights)
          ? r.insights
          : (r.insights as { insights?: unknown[] })?.insights ?? []
        : [];
    const summaryRaw = r.summary;
    const summaryStr =
      summaryRaw != null && typeof summaryRaw === "object" && "summary" in summaryRaw
        ? (summaryRaw as { summary?: string }).summary ?? null
        : typeof summaryRaw === "string"
          ? summaryRaw
          : null;
    recognitionByDoc.set(r.document_id, {
      matchConfidence: r.match_confidence != null ? Number(r.match_confidence) : null,
      matchReason: r.match_reason != null ? String(r.match_reason) : null,
      insuranceFields: r.insurance_fields ?? null,
      courtFields: r.court_fields ?? null,
      insights: insights.length > 0 ? insights : null,
      summary: summaryStr != null && summaryStr.trim() !== "" ? summaryStr : null,
    });
  }
  for (const id of docIds) {
    if (!insuranceByDoc.has(id)) insuranceByDoc.set(id, null);
    if (!recognitionByDoc.has(id)) recognitionByDoc.set(id, null);
  }

  const items = visiblePage.map((d: (typeof visiblePage)[number]) => ({
    id: d.id,
    source: d.source,
    originalName: d.originalName,
    mimeType: d.mimeType,
    pageCount: d.pageCount,
    status: normalizedStatusById.get(d.id) ?? d.status,
    spacesKey: d.spacesKey,
    routedCaseId: d.routedCaseId ?? null,
    createdAt: d.createdAt,
    processedAt: d.processedAt,
    routingStatus: d.routingStatus ?? null,
    lastAuditAction: lastAuditByDoc.get(d.id) ?? null,
    duplicateMatchCount: d.duplicateMatchCount ?? 0,
    duplicateOfId: d.duplicateOfId ?? null,
    processingStage: d.processingStage ?? "uploaded",
    insuranceFields: insuranceByDoc.get(d.id) ?? null,
    recognition: recognitionByDoc.get(d.id) ?? null,
  }));

  res.json({ ok: true, success: true, items, documents: items, nextCursor });
});

// Review queue: documents with recognition data for UI (cursor pagination)
// Only show docs that need review: routingStatus is null or "needs_review"
app.get("/me/review-queue", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
    const migrationBatchIdRaw = Array.isArray(req.query.migrationBatchId)
      ? req.query.migrationBatchId[0]
      : req.query.migrationBatchId;
    const documentIdRaw = Array.isArray(req.query.documentId) ? req.query.documentId[0] : req.query.documentId;
    const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "50"), 10) || 50, 1), 100);
    const cursor = cursorRaw ? String(cursorRaw) : null;
    const migrationBatchId =
      typeof migrationBatchIdRaw === "string" && migrationBatchIdRaw.trim()
        ? migrationBatchIdRaw.trim()
        : null;
    const documentId =
      typeof documentIdRaw === "string" && documentIdRaw.trim() ? documentIdRaw.trim() : null;

    const docs = await prisma.document.findMany({
      where: {
        firmId,
        ...(migrationBatchId ? { migrationBatchId } : {}),
        ...(documentId ? { id: documentId } : {}),
        OR: [
          { reviewState: "IN_REVIEW" },
          { status: "FAILED" },
          { status: "UNMATCHED" },
          {
            reviewState: null,
            status: { in: ["NEEDS_REVIEW", "UPLOADED"] },
            OR: [{ routingStatus: null }, { routingStatus: "needs_review" }],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          originalName: true,
        status: true,
        createdAt: true,
        processedAt: true,
        extractedFields: true,
        confidence: true,
        routedCaseId: true,
        routingStatus: true,
          duplicateOfId: true,
          migrationBatchId: true,
          reviewState: true,
          metaJson: true,
          failureStage: true,
          failureReason: true,
        },
    });

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const docIds = page.map((d: { id: string }) => d.id);
    const migrationBatchIds = [...new Set(page.map((d) => d.migrationBatchId).filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
    const { rows: recRows } =
      docIds.length > 0
        ? await pgPool.query(
            `select document_id, case_number, client_name, suggested_case_id, doc_type, confidence as doc_type_confidence,
                    match_confidence, match_reason, unmatched_reason, classification_reason, classification_signals_json,
                    matter_routing_reason, summary, risks, insights, insurance_fields, court_fields
             from document_recognition
             where document_id = any($1)`,
            [docIds]
          )
        : { rows: [] as any[] };
    interface DocRecRow {
      document_id?: string;
      case_number?: string;
      suggested_case_id?: string | null;
      doc_type?: string;
      risks?: unknown;
      insights?: unknown;
      match_confidence?: unknown;
      doc_type_confidence?: unknown;
      match_reason?: string;
      unmatched_reason?: string | null;
      classification_reason?: string | null;
      classification_signals_json?: unknown;
      matter_routing_reason?: string | null;
      summary?: unknown;
      client_name?: string;
      insurance_fields?: unknown;
    }
    const recByDoc = new Map<string, DocRecRow>(recRows.map((r: DocRecRow) => [r.document_id ?? "", r]));
    const routingRule = await prisma.routingRule.findUnique({
      where: { firmId },
      select: { minAutoRouteConfidence: true },
    });
    const minAutoRouteConfidence = routingRule?.minAutoRouteConfidence ?? 0.9;
    const routingSnapshots =
      docIds.length > 0
        ? await prisma.routingScoreSnapshot.findMany({
            where: {
              firmId,
              documentId: { in: docIds },
            },
            orderBy: { createdAt: "desc" },
            select: {
              documentId: true,
              chosenCaseId: true,
              chosenFolder: true,
              chosenDocType: true,
              confidence: true,
              signalsJson: true,
              candidatesJson: true,
            },
          })
        : [];
    const routingSnapshotByDoc = new Map<string, (typeof routingSnapshots)[number]>();
    for (const snapshot of routingSnapshots) {
      if (!routingSnapshotByDoc.has(snapshot.documentId)) {
        routingSnapshotByDoc.set(snapshot.documentId, snapshot);
      }
    }

    const { rows: emailRows } =
      docIds.length > 0
        ? await pgPool.query<{
            document_id: string;
            attachment_file_name: string | null;
            from_email: string | null;
            subject: string | null;
            received_at: Date | null;
            mailbox_id: string | null;
            is_fax: boolean | null;
            client_name_extracted: string | null;
          }>(
            `
            select distinct on (ea.ingest_document_id)
              ea.ingest_document_id as document_id,
              ea.filename as attachment_file_name,
              em.from_email,
              em.subject,
              em.received_at,
              em.mailbox_connection_id as mailbox_id,
              em.is_fax,
              em.client_name_extracted
            from email_attachments ea
            join email_messages em on em.id = ea.email_message_id
            join mailbox_connections mc on mc.id = em.mailbox_connection_id and mc.firm_id = $1
            where ea.ingest_document_id = any($2)
            order by ea.ingest_document_id, em.received_at desc nulls last, ea.created_at desc
            `,
            [firmId, docIds]
          )
        : { rows: [] as {
            document_id: string;
            attachment_file_name: string | null;
            from_email: string | null;
            subject: string | null;
            received_at: Date | null;
            mailbox_id: string | null;
            is_fax: boolean | null;
            client_name_extracted: string | null;
          }[] };
    const emailByDoc = new Map(
      emailRows.map((row) => [
        row.document_id,
        {
          attachmentFileName: row.attachment_file_name ?? null,
          from: row.from_email ?? null,
          subject: row.subject ?? null,
          receivedAt: row.received_at?.toISOString?.() ?? null,
          mailboxId: row.mailbox_id ?? null,
          isFax: row.is_fax === true,
          extractedClientName: row.client_name_extracted ?? null,
        },
      ])
    );

    const clioWriteBackLogs =
      migrationBatchIds.length > 0
        ? await prisma.systemErrorLog.findMany({
            where: {
              firmId,
              area: "clio_handoff_audit",
              OR: migrationBatchIds.map((batchId) => ({
                metaJson: { path: ["batchId"], equals: batchId },
              })),
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              createdAt: true,
              metaJson: true,
            },
          })
        : [];
    const clioWriteBackByBatch = new Map<
      string,
      {
        outcomeType: ClioHandoffAuditOutcomeType | "unknown";
        createdAt: string;
        handoffExportId: string | null;
        hasIdempotencyKey: boolean;
        reason: string | null;
        batchId: string | null;
      }
    >();
    for (const entry of clioWriteBackLogs) {
      const meta = (entry.metaJson ?? {}) as Record<string, unknown>;
      const batchId = typeof meta.batchId === "string" && meta.batchId.trim() ? meta.batchId.trim() : null;
      if (!batchId || clioWriteBackByBatch.has(batchId)) continue;
      const outcomeValue = typeof meta.outcomeType === "string" ? meta.outcomeType : "unknown";
      const outcomeType = clioHandoffAuditOutcomeTypes.includes(outcomeValue as ClioHandoffAuditOutcomeType)
        ? (outcomeValue as ClioHandoffAuditOutcomeType)
        : "unknown";
      clioWriteBackByBatch.set(batchId, {
        outcomeType,
        createdAt: entry.createdAt.toISOString(),
        handoffExportId: typeof meta.handoffExportId === "string" && meta.handoffExportId.trim() ? meta.handoffExportId.trim() : null,
        hasIdempotencyKey: meta.hasIdempotencyKey === true,
        reason: typeof meta.reason === "string" && meta.reason.trim() ? meta.reason.trim() : null,
        batchId,
      });
    }

    const claimEvents = await prisma.documentAuditEvent.findMany({
      where: {
        documentId: { in: docIds },
        firmId,
        action: { in: ["claimed", "unclaimed"] },
      },
      orderBy: { createdAt: "desc" },
    });
    const lastClaimByDoc = new Map<string, string>();
    for (const e of claimEvents) {
      if (lastClaimByDoc.has(e.documentId)) continue;
      lastClaimByDoc.set(e.documentId, e.action === "claimed" ? e.actor : "");
    }
    const lastAudit = await prisma.documentAuditEvent.findMany({
      where: { documentId: { in: docIds }, firmId },
      orderBy: { createdAt: "desc" },
    });
    const lastAuditByDoc = new Map<string, string>();
    for (const e of lastAudit) {
      if (!lastAuditByDoc.has(e.documentId)) lastAuditByDoc.set(e.documentId, e.action);
    }

    function routingRecommendation(
      matchConf: number | null,
      suggestedCaseId: string | null
    ): "route" | "reject" | "review_manually" {
      const c = matchConf != null ? Number(matchConf) : null;
      if (c != null && c >= 0.9 && suggestedCaseId) return "route";
      if (c != null && c < 0.4) return "reject";
      if (c == null && !suggestedCaseId) return "reject";
      return "review_manually";
    }

    function pushReason(target: string[], value: string | null) {
      const trimmed = typeof value === "string" ? value.trim() : "";
      if (!trimmed || target.includes(trimmed)) return;
      target.push(trimmed);
    }

    function collectReasoningSignals(value: unknown): string[] {
      if (!value) return [];
      if (Array.isArray(value)) {
        return value
          .flatMap((item) => {
            if (typeof item === "string" && item.trim()) return [item.trim()];
            if (item && typeof item === "object") {
              return Object.entries(item as Record<string, unknown>).flatMap(([key, inner]) => {
                if (typeof inner === "string" && inner.trim()) return [`${key.replace(/_/g, " ")}: ${inner.trim()}`];
                if (inner === true) return [key.replace(/_/g, " ")];
                return [];
              });
            }
            return [];
          })
          .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
      }
      if (typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
          .flatMap(([key, item]) => {
            if (typeof item === "string" && item.trim()) return [`${key.replace(/_/g, " ")}: ${item.trim()}`];
            if (typeof item === "number" && Number.isFinite(item) && item > 0) {
              return [`${key.replace(/_/g, " ")}: ${String(item)}`];
            }
            if (item === true) return [key.replace(/_/g, " ")];
            if (Array.isArray(item)) {
              const values = item.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
              return values.length > 0 ? [`${key.replace(/_/g, " ")}: ${values.join(", ")}`] : [];
            }
            return [];
          })
          .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
      }
      return [];
    }

    const items = page.map((d: typeof page[number]) => {
      const rec = recByDoc.get(d.id);
      const suggestedCaseId = rec?.suggested_case_id ?? null;
      const docType = (d.extractedFields as any)?.docType ?? rec?.doc_type ?? null;
      const risks = rec?.risks != null ? (Array.isArray(rec.risks) ? rec.risks : (rec.risks as any)?.risks ?? []) : [];
      const insights = rec?.insights != null ? (Array.isArray(rec.insights) ? rec.insights : (rec.insights as any)?.insights ?? []) : [];
      const caseMatchConfidence = rec?.match_confidence != null ? Number(rec.match_confidence) : d.confidence;
      const docTypeConfidence = rec?.doc_type_confidence != null ? Number(rec.doc_type_confidence) : null;
      const matchReason = rec?.match_reason ?? null;
      const classificationReason = rec?.classification_reason ?? null;
      const classificationSignals = collectReasoningSignals(rec?.classification_signals_json);
      const matterRoutingReason = rec?.matter_routing_reason ?? null;
      const routingExplanationSnapshot = routingSnapshotByDoc.get(d.id);
      const routingExplanation = routingExplanationSnapshot
        ? buildRoutingExplanationFromSnapshot(
            routingExplanationSnapshot,
            minAutoRouteConfidence
          )
        : null;
      const effectiveReviewState = getEffectiveDocumentReviewState({
        reviewState: d.reviewState,
        status: d.status,
      });
      const providerName =
        (d.extractedFields as any)?.providerName ??
        (d.extractedFields as any)?.provider ??
        (d.extractedFields as any)?.facility ??
        null;
      const caseNumber =
        rec?.case_number ??
        (d.extractedFields as any)?.caseNumber ??
        (d.extractedFields as any)?.claimNumber ??
        null;
      const unmatchedReason =
        rec?.unmatched_reason ??
        (!d.routedCaseId && !suggestedCaseId
          ? d.status === "FAILED"
            ? "Document processing failed before routing."
            : "No case match has been confirmed yet."
          : null);
      const recommendation = routingExplanation
        ? routingExplanation.shouldAutoRoute
          ? "route"
          : routingExplanation.reviewReasons.length > 0
            ? "review_manually"
            : routingRecommendation(caseMatchConfidence, suggestedCaseId)
        : routingRecommendation(caseMatchConfidence, suggestedCaseId);
      const reviewReasons: string[] = [];
      if (d.duplicateOfId) pushReason(reviewReasons, "Possible duplicate");
      if (d.status === "FAILED") pushReason(reviewReasons, "Processing failed");
      if (d.status === "UNMATCHED") pushReason(reviewReasons, "Unmatched");
      if (effectiveReviewState === "IN_REVIEW" || d.status === "NEEDS_REVIEW") {
        pushReason(reviewReasons, "Needs manual review");
      }
      if (!d.routedCaseId && !suggestedCaseId) pushReason(reviewReasons, "Needs case routing");
      if (recommendation === "review_manually") pushReason(reviewReasons, "Low-confidence match");
      for (const reason of routingExplanation?.reviewReasons ?? []) {
        pushReason(reviewReasons, reason);
      }
      const emailAutomationSignals = asStringArray(
        getDocumentEmailAutomation(d.metaJson)?.matchSignals?.supportingSignals
      );
      const routingSignals = [
        ...(routingExplanation?.topSignals ?? []),
        ...classificationSignals,
        ...emailAutomationSignals,
      ].filter((signal, index, list) => signal && list.indexOf(signal) === index);
      const summaryPayload =
        rec?.summary != null
          ? typeof rec.summary === "object"
            ? (rec.summary as { summary?: string; keyFacts?: string[] })
            : (() => {
                try {
                  return JSON.parse(String(rec.summary)) as { summary?: string; keyFacts?: string[] };
                } catch {
                  return null;
                }
              })()
          : null;
      return {
        id: d.id,
        fileName: d.originalName,
        clientName: rec?.client_name ?? (d.extractedFields as any)?.clientName ?? null,
        caseNumber,
        suggestedCaseId,
        routedCaseId: d.routedCaseId,
        status: d.status,
        failureStage: d.failureStage ?? null,
        failureReason: d.failureReason ?? null,
        reviewReasons,
        migrationBatchId: d.migrationBatchId ?? null,
        matchConfidence: caseMatchConfidence,
        matchReason,
        unmatchedReason,
        docTypeConfidence,
        routingRecommendation: recommendation,
        extractedFields: d.extractedFields,
        docType,
        providerName,
        createdAt: d.createdAt,
        claimedBy: lastClaimByDoc.get(d.id) ?? null,
        reviewState: effectiveReviewState,
        routingStatus: d.routingStatus ?? null,
        lastAuditAction: lastAuditByDoc.get(d.id) ?? null,
        risks,
        insights,
        classificationReason,
        classificationSignals,
        matchReasoning: {
          matchReason,
          unmatchedReason,
          classificationReason,
          supportingSignals: routingSignals,
          matterRoutingReason,
          candidateSummaries: routingExplanation?.candidateSummaries ?? [],
          reviewReasons,
        },
        summary: summaryPayload,
        insuranceFields: rec?.insurance_fields ?? null,
        emailExtraction: emailByDoc.get(d.id) ?? null,
        emailAutomation: getDocumentEmailAutomation(d.metaJson),
        clioWriteBack: d.migrationBatchId ? clioWriteBackByBatch.get(d.migrationBatchId) ?? null : null,
        duplicateOfId: d.duplicateOfId ?? null,
        ocrDiagnostics: ((d.extractedFields as any)?.ocrDiagnostics ?? null) as
          | { ocrConfidence?: number | null }
          | null,
      };
    });
    res.json({ items, nextCursor });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Global search across cases, documents, providers, records requests (and optionally notes/tasks)
app.get("/me/search", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseAccessContext(req);
    const { firmId } = accessContext;
    const qRaw = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const includeNotesRaw = Array.isArray(req.query.includeNotes) ? req.query.includeNotes[0] : req.query.includeNotes;
    const includeTasksRaw = Array.isArray(req.query.includeTasks) ? req.query.includeTasks[0] : req.query.includeTasks;
    const q = typeof qRaw === "string" ? qRaw.trim() : "";
    const includeNotes = includeNotesRaw === "true" || includeNotesRaw === "1";
    const includeTasks = includeTasksRaw === "true" || includeTasksRaw === "1";

    if (!q || q.length < 1) {
      return res.json({
        ok: true,
        cases: { count: 0, items: [] },
        documents: { count: 0, items: [] },
        providers: { count: 0, items: [] },
        recordsRequests: { count: 0, items: [] },
        notes: includeNotes ? { count: 0, items: [] } : undefined,
        tasks: includeTasks ? { count: 0, items: [] } : undefined,
      });
    }

    const ilike = { contains: q, mode: "insensitive" as const };
    await syncClioCaseAssignmentsIfStale({ firmId }).catch(() => undefined);

    const [cases, documents, providers, recordsRequests, notes, tasks] = await Promise.all([
      prisma.legalCase.findMany({
        where: buildVisibleCaseWhere({
          ...accessContext,
          extraWhere: {
            OR: [
              { title: ilike },
              { caseNumber: ilike },
              { clientName: ilike },
            ],
          },
        }),
        select: { id: true, title: true, caseNumber: true, clientName: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),
      prisma.document.findMany({
        where: { firmId, originalName: ilike },
        select: { id: true, originalName: true, routedCaseId: true },
        take: 20,
        orderBy: { ingestedAt: "desc" },
      }),
      prisma.provider.findMany({
        where: {
          firmId,
          OR: [
            { name: ilike },
            { address: ilike },
            { city: ilike },
            { state: ilike },
            { specialty: ilike },
          ],
        },
        select: { id: true, name: true, city: true, state: true, specialty: true },
        take: 20,
        orderBy: { name: "asc" },
      }),
      prisma.recordsRequest.findMany({
        where: {
          firmId,
          OR: [
            { providerName: ilike },
            { notes: ilike },
            { providerContact: ilike },
          ],
        },
        select: { id: true, providerName: true, status: true, caseId: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),
      includeNotes
        ? prisma.caseNote.findMany({
            where: { firmId, body: ilike },
            select: { id: true, body: true, caseId: true },
            take: 20,
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      includeTasks
        ? prisma.caseTask.findMany({
            where: { firmId, title: ilike },
            select: { id: true, title: true, caseId: true, completedAt: true },
            take: 20,
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    const referencedCaseIds = [
      ...documents
        .map((item) => item.routedCaseId)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ...recordsRequests.map((item) => item.caseId),
      ...(includeNotes ? notes.map((item) => item.caseId) : []),
      ...(includeTasks ? tasks.map((item) => item.caseId) : []),
    ];
    const visibleReferencedCases = referencedCaseIds.length
      ? await prisma.legalCase.findMany({
          where: buildVisibleCaseWhere({
            ...accessContext,
            extraWhere: { id: { in: [...new Set(referencedCaseIds)] } },
          }),
          select: { id: true },
        })
      : [];
    const visibleReferencedCaseIds = new Set(visibleReferencedCases.map((item) => item.id));

    const visibleDocuments = documents.filter(
      (item) => !item.routedCaseId || visibleReferencedCaseIds.has(item.routedCaseId)
    );
    const visibleRecordsRequests = recordsRequests.filter((item) =>
      visibleReferencedCaseIds.has(item.caseId)
    );
    const visibleNotes = includeNotes
      ? notes.filter((item) => visibleReferencedCaseIds.has(item.caseId))
      : undefined;
    const visibleTasks = includeTasks
      ? tasks.filter((item) => visibleReferencedCaseIds.has(item.caseId))
      : undefined;

    res.json({
      ok: true,
      cases: { count: cases.length, items: cases },
      documents: { count: visibleDocuments.length, items: visibleDocuments },
      providers: { count: providers.length, items: providers },
      recordsRequests: { count: visibleRecordsRequests.length, items: visibleRecordsRequests },
      ...(visibleNotes != null && { notes: { count: visibleNotes.length, items: visibleNotes } }),
      ...(visibleTasks != null && { tasks: { count: visibleTasks.length, items: visibleTasks } }),
    });
  } catch (e: any) {
    console.error("Global search failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Feature flags for firm add-ons plus global kill switches exposed to the client.
app.get("/me/features", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { id: true, plan: true, features: true },
    });
    if (!firm) {
      return res.status(404).json({ ok: false, error: "Firm not found" });
    }
    res.json(await getComposedFeatures(firm));
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/me/firm/settings", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        plan: true,
        pageLimitMonthly: true,
        retentionDays: true,
        settings: true,
      },
    });
    if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

    const settings = getJsonRecord(firm.settings);
    const billingEmail =
      typeof settings.billingEmail === "string" && settings.billingEmail.trim()
        ? settings.billingEmail.trim()
        : null;

    res.json({
      ok: true,
      firm: {
        id: firm.id,
        name: firm.name,
        billingEmail,
        plan: normalizeBillingPlanSlug(firm.plan),
        pageLimitMonthly: firm.pageLimitMonthly,
        retentionDays: firm.retentionDays,
        settings,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/me/firm/settings", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { name?: string; billingEmail?: string | null };
    const currentFirm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        plan: true,
        pageLimitMonthly: true,
        retentionDays: true,
        settings: true,
      },
    });
    if (!currentFirm) return res.status(404).json({ ok: false, error: "Firm not found" });

    const nextName =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : currentFirm.name;
    const currentSettings = getJsonRecord(currentFirm.settings);
    const nextSettings: Record<string, unknown> = { ...currentSettings };
    if (body.billingEmail !== undefined) {
      const nextBillingEmail =
        typeof body.billingEmail === "string" && body.billingEmail.trim()
          ? body.billingEmail.trim()
          : null;
      if (nextBillingEmail) nextSettings.billingEmail = nextBillingEmail;
      else delete nextSettings.billingEmail;
    }

    const firm = await prisma.firm.update({
      where: { id: firmId },
      data: {
        name: nextName,
        settings: nextSettings as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        plan: true,
        pageLimitMonthly: true,
        retentionDays: true,
        settings: true,
      },
    });

    const settings = getJsonRecord(firm.settings);
    const billingEmail =
      typeof settings.billingEmail === "string" && settings.billingEmail.trim()
        ? settings.billingEmail.trim()
        : null;

    res.json({
      ok: true,
      firm: {
        id: firm.id,
        name: firm.name,
        billingEmail,
        plan: normalizeBillingPlanSlug(firm.plan),
        pageLimitMonthly: firm.pageLimitMonthly,
        retentionDays: firm.retentionDays,
        settings,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/me/settings", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    });
    const settings = firm?.settings ?? {};
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.patch("/me/settings", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    });
    const current = (firm?.settings as Record<string, unknown>) ?? {};
    const next = { ...current, ...body };
    await prisma.firm.update({
      where: { id: firmId },
      data: { settings: next as Prisma.InputJsonValue },
    });
    res.json(next);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Test CRM webhook (no case required). Requires crm_push feature. Logs to CrmPushLog with caseId "test". */
app.post("/me/crm-push-test", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const result = await pushCrmWebhook({
      firmId,
      caseId: "test",
      title: "CRM Webhook Test",
      bodyMarkdown: "This is a **test message** from Doc Platform. If you see this, your webhook URL is configured correctly.",
      meta: { actionType: "push_test" },
    });
    if (result.ok) {
      res.json({ ok: true, message: "Test message sent." });
    } else {
      const isConfig = result.error?.toLowerCase().includes("not configured");
      res.status(isConfig ? 400 : 502).json({ ok: false, error: result.error });
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Routing rules (auto-route) ===

const MIN_AUTO_ROUTE_CONFIDENCE_MIN = 0.5;
const MIN_AUTO_ROUTE_CONFIDENCE_MAX = 0.99;
const DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE = 0.9;

function clampMinAutoRouteConfidence(v: number): number {
  return Math.max(MIN_AUTO_ROUTE_CONFIDENCE_MIN, Math.min(MIN_AUTO_ROUTE_CONFIDENCE_MAX, v));
}

app.get("/routing-rule", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const [rule, firm] = await Promise.all([
      prisma.routingRule.findUnique({
        where: { firmId },
        select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
      }),
      prisma.firm.findUnique({
        where: { id: firmId },
        select: { settings: true },
      }),
    ]);
    const settings = (firm?.settings as Record<string, unknown>) ?? {};
    const autoRoutedThisMonth = await prisma.documentAuditEvent.count({
      where: {
        firmId,
        action: "auto_routed",
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        },
      },
    });
    res.json({
      minAutoRouteConfidence: rule?.minAutoRouteConfidence ?? DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE,
      autoRouteEnabled: rule?.autoRouteEnabled ?? false,
      autoCreateCaseFromDoc: settings.autoCreateCaseFromDoc === true,
      autoRoutedThisMonth,
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.patch("/routing-rule", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as {
      autoRouteEnabled?: boolean;
      minAutoRouteConfidence?: number;
      autoCreateCaseFromDoc?: boolean;
    };
    const autoRouteEnabled = body.autoRouteEnabled;
    const rawConf = body.minAutoRouteConfidence;
    const minAutoRouteConfidence =
      typeof rawConf === "number" ? clampMinAutoRouteConfidence(rawConf) : undefined;
    const autoCreateCaseFromDoc = body.autoCreateCaseFromDoc;

    const [rule, firm] = await Promise.all([
      prisma.routingRule.upsert({
        where: { firmId },
        create: {
          firmId,
          minAutoRouteConfidence: minAutoRouteConfidence ?? DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE,
          autoRouteEnabled: autoRouteEnabled ?? false,
        },
        update: {
          ...(autoRouteEnabled !== undefined && { autoRouteEnabled }),
          ...(minAutoRouteConfidence !== undefined && { minAutoRouteConfidence }),
        },
        select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
      }),
      prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } }),
    ]);

    if (autoCreateCaseFromDoc !== undefined) {
      const current = (firm?.settings as Record<string, unknown>) ?? {};
      await prisma.firm.update({
        where: { id: firmId },
        data: { settings: { ...current, autoCreateCaseFromDoc } as Prisma.InputJsonValue },
      });
    }

    const settings = (firm?.settings as Record<string, unknown>) ?? {};
    res.json({
      ...rule,
      autoCreateCaseFromDoc:
        autoCreateCaseFromDoc !== undefined ? autoCreateCaseFromDoc : settings.autoCreateCaseFromDoc === true,
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/me/routing-rules", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const rule = await prisma.routingRule.findUnique({
      where: { firmId },
      select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
    });
    const autoRoutedThisMonth = await prisma.documentAuditEvent.count({
      where: {
        firmId,
        action: "auto_routed",
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        },
      },
    });
    res.json({
      minAutoRouteConfidence: rule?.minAutoRouteConfidence ?? DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE,
      autoRouteEnabled: rule?.autoRouteEnabled ?? false,
      autoRoutedThisMonth,
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.patch("/me/routing-rules", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { autoRouteEnabled?: boolean; minAutoRouteConfidence?: number };
    const autoRouteEnabled = body.autoRouteEnabled;
    const rawConf = body.minAutoRouteConfidence;
    const minAutoRouteConfidence =
      typeof rawConf === "number" ? clampMinAutoRouteConfidence(rawConf) : undefined;

    const rule = await prisma.routingRule.upsert({
      where: { firmId },
      create: {
        firmId,
        minAutoRouteConfidence: minAutoRouteConfidence ?? DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE,
        autoRouteEnabled: autoRouteEnabled ?? false,
      },
      update: {
        ...(autoRouteEnabled !== undefined && { autoRouteEnabled }),
        ...(minAutoRouteConfidence !== undefined && { minAutoRouteConfidence }),
      },
      select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
    });
    res.json(rule);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/firms/:firmId/routing-rules", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const authFirmId = (req as any).firmId as string;
    const firmId = String(req.params.firmId ?? "");
    if (authFirmId !== firmId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    let rule = await prisma.routingRule.findUnique({
      where: { firmId },
      select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
    });
    if (!rule) {
      rule = await prisma.routingRule.create({
        data: { firmId, minAutoRouteConfidence: DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE, autoRouteEnabled: false },
        select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
      });
    }
    res.json(rule);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.patch("/firms/:firmId/routing-rules", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const authFirmId = (req as any).firmId as string;
    const firmId = String(req.params.firmId ?? "");
    if (authFirmId !== firmId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const body = (req.body ?? {}) as { autoRouteEnabled?: boolean; minAutoRouteConfidence?: number };
    const autoRouteEnabled = body.autoRouteEnabled;
    const rawConf = body.minAutoRouteConfidence;
    const minAutoRouteConfidence =
      typeof rawConf === "number" ? clampMinAutoRouteConfidence(rawConf) : undefined;

    const rule = await prisma.routingRule.upsert({
      where: { firmId },
      create: {
        firmId,
        minAutoRouteConfidence: minAutoRouteConfidence ?? DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE,
        autoRouteEnabled: autoRouteEnabled ?? false,
      },
      update: {
        ...(autoRouteEnabled !== undefined && { autoRouteEnabled }),
        ...(minAutoRouteConfidence !== undefined && { minAutoRouteConfidence }),
      },
      select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
    });
    res.json(rule);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// === Provider directory ===

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

app.get("/providers/search", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const specialtyRaw = Array.isArray(req.query.specialty) ? req.query.specialty[0] : req.query.specialty;
    const cityRaw = Array.isArray(req.query.city) ? req.query.city[0] : req.query.city;
    const radiusRaw = Array.isArray(req.query.radius) ? req.query.radius[0] : req.query.radius;
    const latRaw = Array.isArray(req.query.lat) ? req.query.lat[0] : req.query.lat;
    const lngRaw = Array.isArray(req.query.lng) ? req.query.lng[0] : req.query.lng;

    const specialty = typeof specialtyRaw === "string" && specialtyRaw.trim() ? specialtyRaw.trim() : null;
    const city = typeof cityRaw === "string" && cityRaw.trim() ? cityRaw.trim() : null;
    const radiusKm = radiusRaw != null ? Math.max(0, Number(radiusRaw)) : null;
    const centerLat = latRaw != null ? Number(latRaw) : null;
    const centerLng = lngRaw != null ? Number(lngRaw) : null;

    const where: { firmId: string; lat?: { not: null }; lng?: { not: null }; city?: string; specialty?: string } = {
      firmId,
      lat: { not: null },
      lng: { not: null },
    };
    if (city) where.city = city;
    if (specialty) where.specialty = specialty;

    let providers = await prisma.provider.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        specialty: true,
        phone: true,
        email: true,
        lat: true,
        lng: true,
      },
    });

    if (radiusKm != null && radiusKm > 0 && centerLat != null && !Number.isNaN(centerLat) && centerLng != null && !Number.isNaN(centerLng)) {
      providers = providers.filter(
        (p) => p.lat != null && p.lng != null && haversineKm(centerLat, centerLng, p.lat, p.lng) <= radiusKm
      );
    }

    res.json({ ok: true, items: providers });
  } catch (err) {
    console.error("Failed to search providers", err);
    res.status(500).json({ ok: false, error: "Failed to search providers" });
  }
});

app.get("/providers/map", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const specialtyRaw = Array.isArray(req.query.specialty) ? req.query.specialty[0] : req.query.specialty;
    const cityRaw = Array.isArray(req.query.city) ? req.query.city[0] : req.query.city;
    const radiusRaw = Array.isArray(req.query.radius) ? req.query.radius[0] : req.query.radius;
    const latRaw = Array.isArray(req.query.lat) ? req.query.lat[0] : req.query.lat;
    const lngRaw = Array.isArray(req.query.lng) ? req.query.lng[0] : req.query.lng;

    const specialty = typeof specialtyRaw === "string" && specialtyRaw.trim() ? specialtyRaw.trim() : null;
    const city = typeof cityRaw === "string" && cityRaw.trim() ? cityRaw.trim() : null;
    const radiusKm = radiusRaw != null ? Math.max(0, Number(radiusRaw)) : null;
    const centerLat = latRaw != null ? Number(latRaw) : null;
    const centerLng = lngRaw != null ? Number(lngRaw) : null;

    const where: { firmId: string; lat?: { not: null }; lng?: { not: null }; city?: string; specialty?: string } = {
      firmId,
      lat: { not: null },
      lng: { not: null },
    };
    if (city) where.city = city;
    if (specialty) where.specialty = specialty;

    let providers = await prisma.provider.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        specialty: true,
        phone: true,
        email: true,
        lat: true,
        lng: true,
      },
    });

    if (radiusKm != null && radiusKm > 0 && centerLat != null && !Number.isNaN(centerLat) && centerLng != null && !Number.isNaN(centerLng)) {
      providers = providers.filter(
        (p) => p.lat != null && p.lng != null && haversineKm(centerLat, centerLng, p.lat, p.lng) <= radiusKm
      );
    }

    res.json({ ok: true, items: providers });
  } catch (err) {
    console.error("Failed to list providers for map", err);
    res.status(500).json({ ok: false, error: "Failed to list providers for map" });
  }
});

app.get("/providers", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const qRaw = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const cityRaw = Array.isArray(req.query.city) ? req.query.city[0] : req.query.city;
    const stateRaw = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
    const specialtyRaw = Array.isArray(req.query.specialty) ? req.query.specialty[0] : req.query.specialty;
    const onlyWithGeoRaw = Array.isArray(req.query.onlyWithGeo) ? req.query.onlyWithGeo[0] : req.query.onlyWithGeo;
    const onlyWithGeo = onlyWithGeoRaw === "true" || onlyWithGeoRaw === "1";

    const q = typeof qRaw === "string" && qRaw.trim() ? qRaw.trim().toLowerCase() : null;
    const city = typeof cityRaw === "string" && cityRaw.trim() ? cityRaw.trim() : null;
    const state = typeof stateRaw === "string" && stateRaw.trim() ? stateRaw.trim() : null;
    const specialty = typeof specialtyRaw === "string" && specialtyRaw.trim() ? specialtyRaw.trim() : null;

    const where: { firmId: string; city?: string; state?: string; specialty?: string; lat?: { not: null }; lng?: { not: null }; OR?: Array<{ [k: string]: unknown }> } = {
      firmId,
    };
    if (onlyWithGeo) {
      where.lat = { not: null };
      where.lng = { not: null };
    }
    if (city) where.city = city;
    if (state) where.state = state;
    if (specialty) where.specialty = specialty;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { state: { contains: q, mode: "insensitive" } },
        { specialty: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ];
    }

    const providers = await prisma.provider.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json({ items: providers });
  } catch (err) {
    console.error("Failed to list providers", err);
    res.status(500).json({ error: "Failed to list providers" });
  }
});

app.get("/providers/:id/cases", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const providerId = String(req.params.id ?? "");

    const provider = await prisma.provider.findFirst({
      where: { id: providerId, firmId },
      select: { id: true },
    });
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const links = await prisma.caseProvider.findMany({
      where: { firmId, providerId },
      include: {
        case: { select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ok: true,
      items: links.map((l) => ({ ...l.case, relationship: l.relationship })),
    });
  } catch (err) {
    console.error("Failed to list provider cases", err);
    res.status(500).json({ error: "Failed to list provider cases" });
  }
});

app.get("/providers/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const provider = await prisma.provider.findFirst({
      where: { id, firmId },
    });
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.json(provider);
  } catch (err) {
    console.error("Failed to get provider", err);
    res.status(500).json({ error: "Failed to get provider" });
  }
});

// Provider summary: profile + related cases, records requests, timeline events
app.get("/providers/:id/summary", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");

    const provider = await prisma.provider.findFirst({
      where: { id, firmId },
    });
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const [caseLinks, recordsRequests, timelineEvents] = await Promise.all([
      prisma.caseProvider.findMany({
        where: { firmId, providerId: id },
        include: {
          case: { select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.recordsRequest.findMany({
        where: { firmId, providerId: id },
        select: { id: true, providerName: true, status: true, caseId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.caseTimelineEvent.findMany({
        where: { firmId, facilityId: id },
        select: {
          id: true,
          eventDate: true,
          eventType: true,
          track: true,
          provider: true,
          diagnosis: true,
          documentId: true,
          caseId: true,
        },
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        take: 20,
      }),
    ]);

    const cases = caseLinks.map((l) => ({ ...l.case, relationship: l.relationship }));

    res.json({
      ok: true,
      provider: {
        id: provider.id,
        name: provider.name,
        address: provider.address,
        city: provider.city,
        state: provider.state,
        phone: provider.phone,
        fax: provider.fax,
        email: provider.email,
        specialty: provider.specialty,
        specialtiesJson: provider.specialtiesJson,
        verified: provider.verified,
        subscriptionTier: provider.subscriptionTier,
        lat: provider.lat,
        lng: provider.lng,
        createdAt: provider.createdAt,
      },
      cases,
      recordsRequests,
      timelineEvents,
    });
  } catch (err) {
    console.error("Failed to get provider summary", err);
    res.status(500).json({ error: "Failed to get provider summary" });
  }
});

app.post("/providers", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as any;
    const { name, address, city, state, phone, fax, email, specialty, specialtiesJson, lat, lng } = body;

    if (!name || !address || !city || !state) {
      return res.status(400).json({ error: "name, address, city, and state are required" });
    }

    const created = await prisma.provider.create({
      data: {
        firmId,
        name,
        address,
        city,
        state,
        phone: phone ?? null,
        fax: fax ?? null,
        email: email ?? null,
        specialty: specialty ?? null,
        specialtiesJson: specialtiesJson ?? null,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("Failed to create provider", err);
    res.status(500).json({ error: "Failed to create provider" });
  }
});

app.patch("/providers/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as any;

    const existing = await prisma.provider.findFirst({
      where: { id, firmId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const updated = await prisma.provider.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        address: body.address ?? undefined,
        city: body.city ?? undefined,
        state: body.state ?? undefined,
        phone: body.phone ?? undefined,
        fax: body.fax ?? undefined,
        email: body.email ?? undefined,
        specialty: body.specialty !== undefined ? body.specialty : undefined,
        specialtiesJson: body.specialtiesJson ?? undefined,
        lat: body.lat !== undefined ? (body.lat == null ? null : Number(body.lat)) : undefined,
        lng: body.lng !== undefined ? (body.lng == null ? null : Number(body.lng)) : undefined,
      },
    });

    res.json(updated);
  } catch (err: any) {
    console.error("Failed to update provider", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.status(500).json({ error: "Failed to update provider" });
  }
});

// ----- Provider account auth (firm admin invites, provider login, provider self-service) -----

app.post(
  "/providers/:id/invites",
  auth,
  requireAdminOrFirmAdminForProvider,
  async (req, res) => {
    try {
      const providerId = String(req.params.id ?? "");
      const body = (req.body ?? {}) as { email?: string };
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ ok: false, error: "email is required" });
      }

      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
      });
      if (!provider) {
        return res.status(404).json({ ok: false, error: "Provider not found" });
      }

      const existing = await prisma.providerAccount.findUnique({
        where: { email },
      });
      if (existing) {
        return res.status(400).json({ ok: false, error: "An account with this email already exists" });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.providerInvite.create({
        data: {
          providerId,
          email,
          tokenHash,
          expiresAt,
        },
      });

      const baseUrl = process.env.DOC_WEB_BASE_URL || process.env.PROVIDER_INVITE_BASE_URL || "http://localhost:3000";
      const inviteLink = `${baseUrl}/provider/invite/accept?token=${rawToken}`;

      if (process.env.NODE_ENV !== "production") {
        return res.status(201).json({
          ok: true,
          inviteLink,
          message: "In development: use the invite link (email not sent)",
        });
      }
      // TODO: send invite email in production
      return res.status(201).json({
        ok: true,
        message: "Invite created (email sending not yet implemented)",
        inviteLink,
      });
    } catch (err) {
      console.error("Failed to create provider invite", err);
      res.status(500).json({ ok: false, error: "Failed to create invite" });
    }
  }
);

app.post("/provider/auth/login", async (req, res) => {
  try {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "email and password are required" });
    }

    const account = await prisma.providerAccount.findUnique({
      where: { email },
      include: { provider: true },
    });
    if (!account) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    createProviderSession(res, account.id);
    res.json({
      ok: true,
      account: {
        id: account.id,
        email: account.email,
        role: account.role,
        providerId: account.providerId,
        providerName: account.provider.name,
      },
    });
  } catch (err) {
    console.error("Provider login failed", err);
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

app.post("/provider/auth/logout", (_req, res) => {
  clearProviderSession(res);
  res.json({ ok: true });
});

app.get("/provider/me", requireProviderSession, async (req, res) => {
  const account = (req as any).providerAccount;
  res.json({
    ok: true,
    account: {
      id: account.id,
      email: account.email,
      role: account.role,
      providerId: account.providerId,
      provider: account.provider,
    },
  });
});

app.patch("/provider/me/provider", requireProviderSession, async (req, res) => {
  try {
    const providerId = (req as any).providerId as string;
    const body = (req.body ?? {}) as any;

    const updateData: Record<string, unknown> = {};
    const allowed = [
      "name",
      "address",
      "city",
      "state",
      "phone",
      "fax",
      "email",
      "specialty",
      "specialtiesJson",
      "lat",
      "lng",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === "lat" || key === "lng") {
          updateData[key] = body[key] == null ? null : Number(body[key]);
        } else if (key === "specialtiesJson") {
          updateData[key] = body[key];
        } else {
          updateData[key] = body[key];
        }
      }
    }

    const updated = await prisma.provider.update({
      where: { id: providerId },
      data: updateData,
    });
    res.json(updated);
  } catch (err) {
    console.error("Failed to update provider listing", err);
    res.status(500).json({ ok: false, error: "Failed to update listing" });
  }
});

// Accept invite: set password and create ProviderAccount
app.get("/provider/invite/accept", async (req, res) => {
  const token = String(req.query.token ?? "").trim();
  if (!token) {
    return res.status(400).json({ ok: false, error: "token is required" });
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const invite = await prisma.providerInvite.findFirst({
    where: { tokenHash },
    include: { provider: true },
  });
  if (!invite || invite.usedAt) {
    return res.status(400).json({ ok: false, error: "Invalid or expired invite" });
  }
  if (invite.expiresAt < new Date()) {
    return res.status(400).json({ ok: false, error: "Invite has expired" });
  }
  res.json({
    ok: true,
    email: invite.email,
    providerName: invite.provider.name,
    providerId: invite.providerId,
  });
});

app.post("/provider/invite/accept", async (req, res) => {
  try {
    const body = (req.body ?? {}) as { token?: string; password?: string };
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    if (!token || !password || password.length < 8) {
      return res.status(400).json({ ok: false, error: "token and password (min 8 chars) are required" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invite = await prisma.providerInvite.findFirst({
      where: { tokenHash },
      include: { provider: true },
    });
    if (!invite || invite.usedAt) {
      return res.status(400).json({ ok: false, error: "Invalid or expired invite" });
    }
    if (invite.expiresAt < new Date()) {
      return res.status(400).json({ ok: false, error: "Invite has expired" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const account = await prisma.$transaction(async (tx) => {
      const a = await tx.providerAccount.create({
        data: {
          providerId: invite.providerId,
          email: invite.email,
          passwordHash,
        },
        include: { provider: true },
      });
      await tx.providerInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
      return a;
    });

    createProviderSession(res, account.id);
    res.json({
      ok: true,
      account: {
        id: account.id,
        email: account.email,
        role: account.role,
        providerId: account.providerId,
        providerName: account.provider.name,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(400).json({ ok: false, error: "An account with this email already exists" });
    }
    console.error("Failed to accept invite", err);
    res.status(500).json({ ok: false, error: "Failed to create account" });
  }
});

// ----- End provider account auth -----

async function addDocumentAuditEvent(input: {
  firmId: string;
  documentId: string;
  actor: string;
  action: string;
  fromCaseId?: string | null;
  toCaseId?: string | null;
  metaJson?: any;
}) {
  const { firmId, documentId, actor, action, fromCaseId, toCaseId, metaJson } = input;
  try {
    await prisma.documentAuditEvent.create({
      data: {
        firmId,
        documentId,
        actor,
        action,
        fromCaseId: fromCaseId ?? null,
        toCaseId: toCaseId ?? null,
        metaJson: metaJson ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to insert audit event", { err, firmId, documentId, action });
  }
}

// Bulk document actions (assign case, mark unmatched, mark needs review)
app.patch("/documents/bulk", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as { documentIds?: string[]; action?: string; caseId?: string };
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.filter((id) => typeof id === "string" && id.trim()) : [];
    const action = String(body.action ?? "").toLowerCase();
    const caseId = body.caseId ? String(body.caseId).trim() : null;

    if (documentIds.length === 0) {
      return res.status(400).json({ ok: false, error: "documentIds is required and must be a non-empty array" });
    }
    if (!["assign_case", "mark_unmatched", "mark_needs_review"].includes(action)) {
      return res.status(400).json({ ok: false, error: "action must be assign_case, mark_unmatched, or mark_needs_review" });
    }
    if (action === "assign_case" && (!caseId || caseId === "")) {
      return res.status(400).json({ ok: false, error: "caseId is required for assign_case" });
    }

    const docs = await prisma.document.findMany({
      where: { id: { in: documentIds }, firmId },
      select: { id: true, routedCaseId: true },
    });
    const foundIds = new Set(docs.map((d) => d.id));
    const notFound = documentIds.filter((id) => !foundIds.has(id));
    if (notFound.length > 0) {
      return res.status(404).json({ ok: false, error: `Documents not found or not in your firm: ${notFound.join(", ")}` });
    }

    if (action === "assign_case" && caseId) {
      const caseRow = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
      if (!caseRow) return res.status(404).json({ ok: false, error: "Case not found" });
    }

    let updated = 0;
    for (const doc of docs) {
      try {
        if (action === "assign_case" && caseId) {
          await routeDocument(firmId, doc.id, caseId, {
            actor,
            action: "bulk_routed",
            routedSystem: "manual",
            routingStatus: "routed",
            reviewState: "APPROVED",
            status: "UPLOADED",
            metaJson: { bulk: true },
          });
          updated++;
        } else if (action === "mark_unmatched") {
          await prisma.document.updateMany({
            where: { id: doc.id, firmId },
            data: {
              status: "UNMATCHED",
              reviewState: "REJECTED",
              routedCaseId: null,
              routedSystem: null,
              routingStatus: null,
            },
          });
          await addDocumentAuditEvent({
            firmId,
            documentId: doc.id,
            actor,
            action: "bulk_marked_unmatched",
            fromCaseId: doc.routedCaseId ?? null,
            toCaseId: null,
            metaJson: { bulk: true },
          });
          updated++;
        } else if (action === "mark_needs_review") {
          await prisma.document.updateMany({
            where: { id: doc.id, firmId },
            data: {
              status: "NEEDS_REVIEW",
              reviewState: "IN_REVIEW",
              routingStatus: "needs_review",
            },
          });
          await addDocumentAuditEvent({
            firmId,
            documentId: doc.id,
            actor,
            action: "bulk_marked_needs_review",
            fromCaseId: doc.routedCaseId ?? null,
            toCaseId: doc.routedCaseId ?? null,
            metaJson: { bulk: true },
          });
          updated++;
        }
      } catch (e) {
        console.warn("[documents/bulk] failed for doc", doc.id, e);
      }
    }

    res.json({ ok: true, updated });
  } catch (e: any) {
    console.error("[documents/bulk]", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/recognize", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "recognized",
    }))) return;

    // Fetch document storage key from Document table (firm-scoped to prevent IDOR)
    const { rows } = await pgPool.query(
      `
      select "spacesKey" as key, "mimeType" as mime_type, "routedCaseId" as routed_case_id
      from "Document"
      where id = $1 and "firmId" = $2
      limit 1
      `,
      [documentId, firmId]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "document not found / no key" });
    }

    const key = rows[0].key as string;
    const mimeType = (rows[0].mime_type as string) || "";
    const routedCaseId = (rows[0].routed_case_id as string | null) ?? null;

    const isPdf =
      mimeType === "application/pdf" ||
      (key.toLowerCase().endsWith(".pdf"));
    if (!isPdf) {
      return res.status(400).json({
        ok: false,
        error: "Document is not a PDF; recognition is only supported for PDFs",
      });
    }

    const { rows: existingRows } = await pgPool.query<{
      text_excerpt: string | null;
      doc_type: string | null;
      client_name: string | null;
      case_number: string | null;
      incident_date: string | null;
      confidence: number | null;
      insurance_fields: unknown;
      court_fields: unknown;
      risks: unknown;
      insights: unknown;
      summary: unknown;
      normalized_text_hash: string | null;
      extracted_json: unknown;
    }>(
      `select text_excerpt, doc_type, client_name, case_number, incident_date, confidence,
        insurance_fields, court_fields, risks, insights, summary, normalized_text_hash, extracted_json
       from document_recognition where document_id = $1`,
      [documentId]
    );
    const existingRec = existingRows[0] ?? null;
    const bytes = await getObjectBuffer(key);
    const storedText = existingRec?.text_excerpt?.trim() ?? "";
    const text = storedText || (await extractTextFromPdf(bytes));

    console.log("[recognize]", {
      documentId,
      spacesKey: key,
      extractedTextLength: text.length,
      textSource: storedText ? "stored_ocr" : "embedded_pdf",
    });

    const textHash = getStoredTextHash(text);
    let extractedJson = existingRec?.extracted_json ?? null;
    const [insuranceOn, courtOn] = await Promise.all([
      hasFeature(firmId, "insurance_extraction"),
      hasFeature(firmId, "court_extraction"),
    ]);
    const recognitionPrompt = {
      ...DOCUMENT_RECOGNITION_PROMPTS.recognition,
      promptVersion: `${DOCUMENT_RECOGNITION_PROMPTS.recognition.promptVersion}:insurance-${insuranceOn ? "on" : "off"}:court-${courtOn ? "on" : "off"}`,
    };
    const recognitionTaskKey = buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.recognition);
    const recognitionCacheState = inspectTaskCache(extractedJson, recognitionTaskKey, {
      textHash,
      firmId,
      documentId,
      ...recognitionPrompt,
    });
    const canReuseRecognition =
      existingRec != null &&
      Boolean(existingRec.doc_type) &&
      recognitionCacheState.cacheUsed;

    let excerpt = existingRec?.text_excerpt ?? text.slice(0, 1200);
    let finalDocType: string;
    let finalConfidence: number;
    let clientName: string | null;
    let caseNumber: string | null;
    let incidentDate: string | null;

    if (canReuseRecognition) {
      finalDocType = existingRec?.doc_type ?? "unknown";
      finalConfidence =
        existingRec?.confidence == null
          ? 0
          : typeof existingRec.confidence === "number"
            ? existingRec.confidence
            : Number(existingRec.confidence) || 0;
      clientName = existingRec?.client_name ?? null;
      caseNumber = existingRec?.case_number ?? null;
      incidentDate = existingRec?.incident_date ?? null;
    } else {
      const result = classifyAndExtract(text);
      const classification = classify(text, key.split("/").pop() ?? "");
      finalDocType = classification.docType !== "unknown" ? classification.docType : result.docType;
      finalConfidence = classification.docType !== "unknown" ? classification.confidence : result.confidence;
      clientName = result.clientName;
      caseNumber = result.caseNumber;
      incidentDate = result.incidentDate;
      excerpt = result.excerpt;
      extractedJson = upsertTaskCacheEntry(extractedJson, recognitionTaskKey, {
        textHash,
        firmId,
        documentId,
        ...recognitionPrompt,
        generatedAt: new Date().toISOString(),
      });
    }
    const recognitionCacheMeta = getTaskCacheResponseMeta(extractedJson, recognitionTaskKey, {
      textHash,
      firmId,
      documentId,
      ...recognitionPrompt,
    });
    logTaskCacheDecision(
      { source: "documents.recognize", documentId },
      {
        ...recognitionCacheMeta,
        cacheUsed: recognitionCacheState.cacheUsed,
        recomputeReason: recognitionCacheState.recomputeReason,
      }
    );

    if ((finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_")) && !insuranceOn) finalDocType = "other";
    if ((finalDocType === "court_filing" || finalDocType.startsWith("court_")) && !courtOn) finalDocType = "other";

    const baseFields: Record<string, unknown> = {
      docType: finalDocType,
      caseNumber,
      clientName,
      incidentDate,
      excerptLength: excerpt.length,
    };
    const extractedFields = runExtractors(text, finalDocType, baseFields);

    const risksResolution = await resolveTaskCache({
      extractedJson,
      taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.risks),
      textHash,
      firmId,
      documentId,
      existingValue: existingRec?.risks ?? null,
      compute: () => {
        const { risks } = analyzeRisks(text);
        return risks.length > 0 ? risks : null;
      },
      logContext: { source: "documents.recognize", documentId },
      telemetryContext: { firmId, documentId, source: "documents.recognize" },
      ...DOCUMENT_RECOGNITION_PROMPTS.risks,
    });
    extractedJson = risksResolution.extractedJson;

    const insightsResolution = await resolveTaskCache({
      extractedJson,
      taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.insights),
      textHash,
      firmId,
      documentId,
      existingValue: existingRec?.insights ?? null,
      compute: () => {
        const { insights } = analyzeDocumentInsights(text);
        return insights.length > 0 ? insights : null;
      },
      logContext: { source: "documents.recognize", documentId },
      telemetryContext: { firmId, documentId, source: "documents.recognize" },
      ...DOCUMENT_RECOGNITION_PROMPTS.insights,
    });
    extractedJson = insightsResolution.extractedJson;

    const summaryResolution = await resolveTaskCache({
      extractedJson,
      taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.summary),
      textHash,
      firmId,
      documentId,
      existingValue: existingRec?.summary ?? null,
      compute: async () => {
        const { summary: summaryText, keyFacts } = await summarizeDocument(text, {
          firmId,
          documentId,
          caseId: routedCaseId,
          source: "documents.recognize",
        });
        return summaryText || keyFacts.length > 0 ? { summary: summaryText, keyFacts } : null;
      },
      logContext: { source: "documents.recognize", documentId },
      telemetryContext: { firmId, documentId, caseId: routedCaseId, source: "documents.recognize" },
      ...DOCUMENT_RECOGNITION_PROMPTS.summary,
    });
    extractedJson = summaryResolution.extractedJson;

    const insuranceResolution =
      insuranceOn && (finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_"))
        ? await resolveTaskCache({
            extractedJson,
            taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.insurance),
            textHash,
            firmId,
            documentId,
            existingValue: existingRec?.insurance_fields ?? null,
            compute: () =>
              extractInsuranceOfferFields({
                text,
                fileName: key.split("/").pop() ?? undefined,
                telemetryContext: {
                  firmId,
                  documentId,
                  caseId: routedCaseId,
                  source: "documents.recognize",
                },
              }),
            logContext: { source: "documents.recognize", documentId },
            telemetryContext: { firmId, documentId, caseId: routedCaseId, source: "documents.recognize" },
            ...DOCUMENT_RECOGNITION_PROMPTS.insurance,
          })
        : { value: existingRec?.insurance_fields ?? null, reused: true, extractedJson };
    extractedJson = insuranceResolution.extractedJson;

    const courtResolution =
      courtOn && (finalDocType === "court_filing" || finalDocType.startsWith("court_"))
        ? await resolveTaskCache({
            extractedJson,
            taskKey: buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.court),
            textHash,
            firmId,
            documentId,
            existingValue: existingRec?.court_fields ?? null,
            compute: () =>
              extractCourtFields({
                text,
                fileName: key.split("/").pop() ?? undefined,
                telemetryContext: {
                  firmId,
                  documentId,
                  caseId: routedCaseId,
                  source: "documents.recognize",
                },
              }),
            logContext: { source: "documents.recognize", documentId },
            telemetryContext: { firmId, documentId, caseId: routedCaseId, source: "documents.recognize" },
            ...DOCUMENT_RECOGNITION_PROMPTS.court,
          })
        : { value: existingRec?.court_fields ?? null, reused: true, extractedJson };
    extractedJson = courtResolution.extractedJson;
    const insuranceCacheMeta = insuranceOn
      ? getTaskCacheResponseMeta(extractedJson, buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.insurance), {
          textHash,
          firmId,
          documentId,
          ...DOCUMENT_RECOGNITION_PROMPTS.insurance,
        })
      : null;
    const courtCacheMeta = courtOn
      ? getTaskCacheResponseMeta(extractedJson, buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.court), {
          textHash,
          firmId,
          documentId,
          ...DOCUMENT_RECOGNITION_PROMPTS.court,
        })
      : null;

    await pgPool.query(
      `
      insert into document_recognition
      (document_id,text_excerpt,doc_type,client_name,case_number,incident_date,confidence,insurance_fields,court_fields,risks,insights,summary,normalized_text_hash,extraction_version,extracted_json)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      on conflict (document_id) do update
      set
        text_excerpt=excluded.text_excerpt,
        doc_type=excluded.doc_type,
        client_name=excluded.client_name,
        case_number=excluded.case_number,
        incident_date=excluded.incident_date,
        confidence=excluded.confidence,
        insurance_fields=excluded.insurance_fields,
        court_fields=excluded.court_fields,
        risks=excluded.risks,
        insights=excluded.insights,
        summary=excluded.summary,
        normalized_text_hash=excluded.normalized_text_hash,
        extraction_version=excluded.extraction_version,
        extracted_json=excluded.extracted_json,
        updated_at=now()
      `,
      [
        documentId,
        excerpt,
        finalDocType,
        clientName,
        caseNumber,
        incidentDate,
        finalConfidence,
        serializeJsonbParam(insuranceResolution.value),
        serializeJsonbParam(courtResolution.value),
        serializeJsonbParam(risksResolution.value),
        serializeJsonbParam(insightsResolution.value),
        serializeJsonbParam(summaryResolution.value),
        textHash,
        "document-extraction-cache-v1",
        serializeJsonbParam(extractedJson),
      ]
    );

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (doc) {
      await prisma.document.updateMany({
        where: { id: documentId, firmId },
        data: { extractedFields: extractedFields as Prisma.InputJsonValue, confidence: finalConfidence },
      });
    }

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor: "system",
      action: "suggested",
      fromCaseId: null,
      toCaseId: null,
      metaJson: {
        docType: finalDocType,
        clientName,
        caseNumber,
        incidentDate,
        confidence: finalConfidence,
      },
    });

    res.json({
      ok: true,
      documentId,
      docType: finalDocType,
      confidence: finalConfidence,
      caseNumber,
      clientName,
      incidentDate,
      excerptLength: excerpt.length,
      excerpt,
      cacheUsed: [
        recognitionCacheMeta,
        risksResolution.meta,
        insightsResolution.meta,
        summaryResolution.meta,
        insuranceCacheMeta,
        courtCacheMeta,
      ].filter((meta): meta is NonNullable<typeof meta> => meta != null).every((meta) => meta.cacheUsed),
      cache: {
        recognition: recognitionCacheMeta,
        summary: summaryResolution.meta,
        risks: risksResolution.meta,
        insights: insightsResolution.meta,
        ...(insuranceCacheMeta ? { insurance: insuranceCacheMeta } : {}),
        ...(courtCacheMeta ? { court: courtCacheMeta } : {}),
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/cache/invalidate", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    if (!isInternalCacheControlRequest(req)) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "invalidated",
    }))) return;
    const body = (req.body ?? {}) as { taskType?: string | null };
    const taskType =
      typeof body.taskType === "string" && body.taskType.trim().length > 0 ? body.taskType.trim() : null;
    const allowedTaskTypes = new Set(Object.values(DOCUMENT_RECOGNITION_TASKS));
    if (taskType && !allowedTaskTypes.has(taskType as (typeof DOCUMENT_RECOGNITION_TASKS)[keyof typeof DOCUMENT_RECOGNITION_TASKS])) {
      return res.status(400).json({
        ok: false,
        error: `taskType must be one of: ${Array.from(allowedTaskTypes).join(", ")}`,
      });
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }

    const { rows } = await pgPool.query<{ extracted_json: unknown }>(
      `select extracted_json from document_recognition where document_id = $1`,
      [documentId]
    );
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: "document recognition not found" });
    }

    const invalidation = invalidateTaskCacheEntries(existing.extracted_json, taskType);
    await pgPool.query(
      `
      update document_recognition
      set extracted_json = $1,
          updated_at = now()
      where document_id = $2
      `,
      [invalidation.extractedJson, documentId]
    );

    logInfo("document_recognition_cache_invalidation", {
      source: "documents.invalidate_cache",
      documentId,
      firmId,
      taskType,
      removedKeys: invalidation.removedKeys,
      remainingKeys: invalidation.remainingKeys,
    });

    res.json({
      ok: true,
      documentId,
      invalidated: taskType ?? "all",
      removedKeys: invalidation.removedKeys,
      remainingKeys: invalidation.remainingKeys,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Manual reprocess: Retry processing (full), Retry OCR, or Rebuild extraction
app.post("/documents/:id/reprocess", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "reprocessed",
    }))) return;
    const actor = (req as any).apiKeyPrefix ?? "api";
    const body = (req.body ?? {}) as { mode?: string };
    const mode = (String(body.mode ?? "full").toLowerCase() || "full") as "full" | "ocr" | "extraction";
    if (!["full", "ocr", "extraction"].includes(mode)) {
      return res.status(400).json({ ok: false, error: "mode must be full, ocr, or extraction" });
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, firmId: true, duplicateOfId: true, mimeType: true, originalName: true },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }
    if (doc.duplicateOfId) {
      return res.status(400).json({ ok: false, error: "cannot reprocess a duplicate document" });
    }

    if (mode === "full" || mode === "ocr") {
      await prisma.document.updateMany({
        where: { id: documentId, firmId },
        data: { status: "PROCESSING", processingStage: "uploaded" },
      });
      await enqueueOcrJob({ documentId, firmId });
    } else {
      // mode === "extraction": requires existing recognition data
      const { rows } = await pgPool.query(
        `select document_id, text_excerpt, doc_type from document_recognition where document_id = $1`,
        [documentId]
      );
      if (!rows[0]?.text_excerpt || !rows[0]?.doc_type) {
        return res.status(400).json({
          ok: false,
          error: "Run recognition or OCR first; document has no text_excerpt or doc_type",
        });
      }
      await prisma.document.updateMany({
        where: { id: documentId, firmId },
        data: { status: "PROCESSING", processingStage: "extraction" },
      });
      await enqueueExtractionJob({ documentId, firmId });
    }

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "reprocess",
      fromCaseId: null,
      toCaseId: null,
      metaJson: { mode },
    });

    res.json({ ok: true, documentId, mode });
  } catch (e: any) {
    logSystemError("api", e).catch(() => {});
    const firmId = (req as any).firmId as string | undefined;
    const documentId = String((req as any).params?.id ?? "");
    if (firmId && documentId) {
      addDocumentAuditEvent({
        firmId,
        documentId,
        actor: "system",
        action: "reprocess_failed",
        fromCaseId: null,
        toCaseId: null,
        metaJson: { error: String(e?.message || e) },
      }).catch(() => {});
    }
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Re-run case matching for a document (requires existing recognition)
app.post("/documents/:id/rematch", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "rematched",
    }))) return;
    const actor = (req as any).apiKeyPrefix ?? "api";

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: {
        id: true,
        routedCaseId: true,
        originalName: true,
        source: true,
        status: true,
      },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }

    const extractedForRouting = await getExtractedForRouting(documentId);
    if (!extractedForRouting) {
      return res.status(400).json({ ok: false, error: "Run recognition first" });
    }

    const { rows: recognitionRows } = await pgPool.query<{ text_excerpt: string | null }>(
      `select text_excerpt from document_recognition where document_id = $1`,
      [documentId]
    );
    const routingRule = await prisma.routingRule.findUnique({
      where: { firmId },
      select: { minAutoRouteConfidence: true },
    });
    const minAutoRouteConfidence = routingRule?.minAutoRouteConfidence ?? 0.9;
    const routingScore = await scoreDocumentRouting(
      {
        id: documentId,
        firmId,
        originalName: doc.originalName ?? null,
        source: doc.source ?? null,
        routedCaseId: doc.routedCaseId ?? null,
        status: doc.status ?? null,
      },
      extractedForRouting,
      recognitionRows[0]?.text_excerpt ?? null
    );
    await saveRoutingScoreSnapshot(firmId, documentId, routingScore).catch(() => undefined);
    const routingExplanation = buildRoutingExplanation(routingScore, {
      minConfidence: minAutoRouteConfidence,
    });

    await pgPool.query(
      `update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, updated_at = now() where document_id = $3`,
      [
        routingScore.confidence,
        routingScore.candidates[0]?.reason ??
          routingExplanation.reviewReasons[0] ??
          routingScore.signals.baseMatchReason ??
          null,
        documentId,
        routingScore.chosenCaseId,
      ]
    );

    const updateData: { status?: string; routedCaseId?: string | null } = {};
    if (routingExplanation.shouldAutoRoute && routingScore.chosenCaseId) {
      updateData.status = "UPLOADED";
      updateData.routedCaseId = routingScore.chosenCaseId;
    } else if (routingScore.confidence >= 0.5) {
      updateData.status = "NEEDS_REVIEW";
      updateData.routedCaseId = routingScore.chosenCaseId ?? null;
    } else {
      updateData.status = "NEEDS_REVIEW";
      updateData.routedCaseId = null;
    }
    await prisma.document.updateMany({
      where: { id: documentId, firmId },
      data: {
        ...(updateData as { status?: "UPLOADED" | "NEEDS_REVIEW"; routedCaseId?: string | null }),
        ...(updateData.status === "NEEDS_REVIEW" ? { reviewState: "IN_REVIEW" as const } : {}),
      },
    });

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "rematch",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: routingScore.chosenCaseId ?? null,
      metaJson: {
        matchConfidence: routingScore.confidence,
        matchReason:
          routingScore.candidates[0]?.reason ??
          routingExplanation.reviewReasons[0] ??
          null,
        caseId: routingScore.chosenCaseId,
        topSignals: routingExplanation.topSignals,
        candidateSummaries: routingExplanation.candidateSummaries,
        reviewReasons: routingExplanation.reviewReasons,
      },
    });

    res.json({
      ok: true,
      documentId,
      matchConfidence: routingScore.confidence,
      matchReason:
        routingScore.candidates[0]?.reason ??
        routingExplanation.reviewReasons[0] ??
        null,
      caseId: routingScore.chosenCaseId,
      topSignals: routingExplanation.topSignals,
      reviewReasons: routingExplanation.reviewReasons,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Reprocess document: retry full pipeline, OCR only, or extraction only
app.post("/documents/:id/reprocess", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "reprocessed",
    }))) return;
    const actor = (req as any).apiKeyPrefix ?? "api";
    const body = (req.body ?? {}) as { mode?: string };
    const mode = String(body.mode ?? "full").toLowerCase() as "full" | "ocr" | "extraction";
    const validModes = ["full", "ocr", "extraction"];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        ok: false,
        error: `mode must be one of: ${validModes.join(", ")}`,
      });
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, duplicateOfId: true },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }
    if (doc.duplicateOfId) {
      return res.status(400).json({ ok: false, error: "Cannot reprocess a duplicate document" });
    }

    if (mode === "full" || mode === "ocr") {
      await prisma.document.update({
        where: { id: documentId, firmId },
        data: { status: "PROCESSING", processingStage: "uploaded" },
      });
      await enqueueOcrJob({ documentId, firmId });
    } else {
      // mode === "extraction"
      const { rows } = await pgPool.query<{ document_id: string }>(
        `select document_id from document_recognition where document_id = $1 and text_excerpt is not null and doc_type is not null`,
        [documentId]
      );
      if (!rows.length) {
        return res.status(400).json({
          ok: false,
          error: "Document has no recognition data. Run retry processing or retry OCR first.",
        });
      }
      await prisma.document.update({
        where: { id: documentId, firmId },
        data: { status: "PROCESSING", processingStage: "extraction" },
      });
      await enqueueExtractionJob({ documentId, firmId });
    }

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "reprocess",
      fromCaseId: null,
      toCaseId: null,
      metaJson: { mode },
    });

    res.json({ ok: true, documentId, mode });
  } catch (e: any) {
    const errMsg = String(e?.message ?? e);
    logSystemError("api", errMsg, (e as Error)?.stack).catch(() => {});
    res.status(500).json({ ok: false, error: errMsg });
  }
});
app.post("/documents/:id/approve", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "approved",
    }))) return;
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as any;
    const trace = createFastPathTrace(res, "documents_approve", { firmId, documentId });

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true, reviewState: true, status: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });
    const feedbackContext = await loadRoutingFeedbackContext(firmId, documentId);

    await prisma.document.updateMany({
      where: { id: documentId, firmId },
      data: { reviewState: "APPROVED" },
    });
    trace.mark("persistence_complete", { reviewState: "APPROVED" });

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "approved",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: doc.routedCaseId ?? null,
      metaJson: body ?? null,
    });
    trace.mark("audit_complete");

    if (doc.routedCaseId) {
      const enqueueResults = await Promise.allSettled([
        enqueueTimelineRebuildJob({ caseId: doc.routedCaseId, firmId }),
        enqueuePostRouteSyncJob({
          documentId,
          firmId,
          caseId: doc.routedCaseId,
          action: "approved",
        }),
      ]);
      for (const result of enqueueResults) {
        if (result.status === "rejected") {
          console.warn("[approve] failed to enqueue post-approve follow-up", {
            caseId: doc.routedCaseId,
            documentId,
            error: result.reason,
          });
        }
      }
      trace.mark("enqueue_complete", {
        queuedJobs: ["timeline_rebuild", "post_route_sync"],
        caseId: doc.routedCaseId,
      });
    } else {
      trace.mark("enqueue_complete", { queuedJobs: [] });
    }

    await persistRoutingFeedbackOutcome(feedbackContext, {
      firmId,
      documentId,
      finalCaseId: doc.routedCaseId ?? null,
      finalStatus: doc.status ?? null,
      correctedBy: actor,
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/reject", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "rejected",
    }))) return;
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as any;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true, reviewState: true, status: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });
    const feedbackContext = await loadRoutingFeedbackContext(firmId, documentId);

    await prisma.document.updateMany({
      where: { id: documentId, firmId },
      data: { reviewState: "REJECTED" },
    });

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "rejected",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: doc.routedCaseId ?? null,
      metaJson: body ?? null,
    });

    await persistRoutingFeedbackOutcome(feedbackContext, {
      firmId,
      documentId,
      finalCaseId: null,
      finalStatus: doc.status ?? "NEEDS_REVIEW",
      correctedBy: actor,
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/route", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "routed",
    }))) return;
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as any;
    const toCaseId = body?.caseId ? String(body.caseId) : null;
    const feedbackContext = await loadRoutingFeedbackContext(firmId, documentId);
    const trace = createFastPathTrace(res, "documents_route", {
      firmId,
      documentId,
      caseId: toCaseId,
    });

    const result = await routeDocument(firmId, documentId, toCaseId, {
      actor,
      action: "routed",
      routedSystem: "manual",
      routingStatus: toCaseId ? "routed" : null,
      reviewState: toCaseId ? "APPROVED" : null,
      status: toCaseId ? "UPLOADED" : undefined,
      metaJson: body ?? null,
      timingReporter: (stage, stageMeta) => {
        trace.mark(stage, stageMeta);
      },
    });

    if (!result.ok) {
      return res.status(404).json({ ok: false, error: result.error });
    }

    await persistRoutingFeedbackOutcome(feedbackContext, {
      firmId,
      documentId,
      finalCaseId: toCaseId,
      finalStatus: toCaseId ? "UPLOADED" : "UNMATCHED",
      correctedBy: actor,
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/claim", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "claimed",
    }))) return;
    const body = (req.body ?? {}) as any;
    const user = body?.user || body?.claimedBy || "unknown";

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true, status: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    // Simple idempotent semantics: if already claimed by someone else, return 409
    const existingEvents = await prisma.documentAuditEvent.findMany({
      where: { documentId, firmId, action: { in: ["claimed", "unclaimed"] } },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const lastClaim = existingEvents[0];
    if (lastClaim?.action === "claimed" && lastClaim.actor !== user) {
      return res.status(409).json({ ok: false, error: `Already claimed by ${lastClaim.actor}` });
    }

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor: user,
      action: "claimed",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: doc.routedCaseId ?? null,
      metaJson: body ?? null,
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/unclaim", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "unclaimed",
    }))) return;
    const body = (req.body ?? {}) as any;
    const user = body?.user || body?.claimedBy || "unknown";

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor: user,
      action: "unclaimed",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: doc.routedCaseId ?? null,
      metaJson: body ?? null,
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/documents/:id/download", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "downloaded",
    }))) return;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { spacesKey: true, mimeType: true, originalName: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    const url = await getPresignedGetUrl(doc.spacesKey, 3600);
    res.json({ ok: true, url, originalName: doc.originalName });
  } catch (e: any) {
    console.error("Failed to get download URL", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/documents/:id/export-preview", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: {
        id: true,
        originalName: true,
        routedCaseId: true,
        extractedFields: true,
        metaJson: true,
      },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }

    const meta = getJsonRecord(doc.metaJson);
    const exportFileNameOverride =
      meta.exportFileNameOverride != null ? String(meta.exportFileNameOverride).trim() || "" : "";
    const exportFolderPathOverride =
      meta.exportFolderPathOverride != null ? String(meta.exportFolderPathOverride).trim() || "" : "";

    if (!doc.routedCaseId) {
      return res.json({
        ok: true,
        needsRouting: true,
        message: "Assign a case to preview export naming.",
        fileName: null,
        folderPath: null,
        context: null,
        exportFileNameOverride,
        exportFolderPathOverride,
      });
    }

    const legalCase = await prisma.legalCase.findFirst({
      where: { id: doc.routedCaseId, firmId },
      select: { id: true, caseNumber: true, clientName: true, title: true },
    });
    if (!legalCase) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }

    const [rules, recognition] = await Promise.all([
      getFirmExportNamingRules(firmId),
      getRecognitionForDocument(documentId),
    ]);
    const growthExtraction = getJsonRecord(getJsonRecord(doc.extractedFields).growthExtraction);
    const serviceDates = getJsonRecord(growthExtraction.serviceDates);
    const growthPrimaryServiceDate =
      typeof serviceDates.primaryServiceDate === "string" && serviceDates.primaryServiceDate.trim()
        ? serviceDates.primaryServiceDate.trim()
        : undefined;
    const exportedAtIso = new Date().toISOString();
    const ctx = buildDocumentNamingContext(
      {
        caseNumber: legalCase.caseNumber,
        clientName: legalCase.clientName,
        title: legalCase.title,
      },
      { id: doc.id, originalName: doc.originalName },
      recognition,
      exportedAtIso,
      growthPrimaryServiceDate
    );
    const caseCtx = buildDocumentNamingContext(
      {
        caseNumber: legalCase.caseNumber,
        clientName: legalCase.clientName,
        title: legalCase.title,
      },
      { id: "", originalName: null },
      null,
      exportedAtIso
    );

    const ext = (doc.originalName ?? "").split(".").pop()?.toLowerCase() || "bin";
    const fileName =
      exportFileNameOverride !== ""
        ? exportFileNameOverride.includes(".")
          ? exportFileNameOverride
          : `${exportFileNameOverride}.${ext}`
        : (() => {
            const baseName = applyFilePattern(rules, ctx);
            return baseName.toLowerCase().endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;
          })();

    const folderPath =
      exportFolderPathOverride !== ""
        ? exportFolderPathOverride
        : [applyFolderPattern(rules, caseCtx), getFolderForDocType(rules, ctx.documentType)]
            .filter(Boolean)
            .join("/") || null;

    res.json({
      ok: true,
      needsRouting: false,
      message: null,
      fileName,
      folderPath,
      context: {
        caseNumber: ctx.caseNumber,
        clientName: ctx.clientName,
        caseTitle: ctx.caseTitle,
        documentType: ctx.documentType,
        providerName: ctx.providerName,
        serviceDate: ctx.serviceDate,
        originalName: ctx.originalName,
      },
      exportFileNameOverride,
      exportFolderPathOverride,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/documents/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "updated",
    }))) return;
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as {
      status?: string;
      routedCaseId?: string | null;
      routingStatus?: string | null;
      reviewState?: string | null;
      exportFileNameOverride?: string | null;
      exportFolderPathOverride?: string | null;
    };

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, status: true, routedCaseId: true, routingStatus: true, reviewState: true, metaJson: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    if (body.routedCaseId !== undefined) {
      const feedbackContext = await loadRoutingFeedbackContext(firmId, documentId);
      const toCaseId = body.routedCaseId === null || body.routedCaseId === "" ? null : String(body.routedCaseId).trim();
      if (toCaseId) {
        const caseRow = await prisma.legalCase.findFirst({ where: { id: toCaseId, firmId }, select: { id: true } });
        if (!caseRow) return res.status(404).json({ ok: false, error: "case not found" });
        const requestedReviewState = body.reviewState == null ? null : getStoredDocumentReviewState(body.reviewState);
        const result = await routeDocument(firmId, documentId, toCaseId, {
          actor,
          action: "routed",
          routedSystem: "manual",
          routingStatus: "routed",
          reviewState: requestedReviewState ?? "APPROVED",
          status: "UPLOADED",
          metaJson: { source: "patch" },
        });
        if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
        await persistRoutingFeedbackOutcome(feedbackContext, {
          firmId,
          documentId,
          finalCaseId: toCaseId,
          finalStatus: "UPLOADED",
          correctedBy: actor,
        });
        return res.json({ ok: true, id: documentId });
      }
      await prisma.document.updateMany({
        where: { id: documentId, firmId },
        data: { routedCaseId: null, routedSystem: null, routingStatus: null, status: "UNMATCHED" },
      });
      await addDocumentAuditEvent({
        firmId,
        documentId,
        actor,
        action: "unrouted",
        fromCaseId: doc.routedCaseId ?? null,
        toCaseId: null,
        metaJson: { source: "patch" },
      });
      await persistRoutingFeedbackOutcome(feedbackContext, {
        firmId,
        documentId,
        finalCaseId: null,
        finalStatus: "UNMATCHED",
        correctedBy: actor,
      });
      return res.json({ ok: true, id: documentId });
    }

    const updates: Record<string, unknown> = {};
    const requestedReviewState =
      body.reviewState === undefined
        ? undefined
        : body.reviewState === null
          ? null
          : isDocumentReviewState(body.reviewState)
            ? body.reviewState
            : "__invalid__";
    if (requestedReviewState === "__invalid__") {
      return res.status(400).json({ ok: false, error: "Invalid reviewState" });
    }
    if (requestedReviewState === "EXPORT_READY" && !canMarkDocumentExportReady(doc.reviewState)) {
      return res.status(400).json({ ok: false, error: "Only approved documents can be marked export-ready" });
    }

    if (body.status !== undefined) {
      const validStatuses = ["RECEIVED", "PROCESSING", "NEEDS_REVIEW", "UPLOADED", "FAILED", "UNMATCHED"];
      if (validStatuses.includes(String(body.status))) {
        updates.status = body.status;
        if (body.status === "NEEDS_REVIEW" && requestedReviewState === undefined) {
          updates.reviewState = "IN_REVIEW";
        }
        if (body.status === "UNMATCHED" && requestedReviewState === undefined) {
          updates.reviewState = "REJECTED";
        }
      }
    }
    if (body.routingStatus !== undefined) {
      updates.routingStatus = body.routingStatus === null || body.routingStatus === "" ? null : String(body.routingStatus);
      if (updates.routingStatus === "needs_review") {
        updates.status = "NEEDS_REVIEW";
        if (requestedReviewState === undefined) {
          updates.reviewState = "IN_REVIEW";
        }
      }
    }
    if (requestedReviewState !== undefined) {
      updates.reviewState = requestedReviewState;
    }
    if (body.exportFileNameOverride !== undefined || body.exportFolderPathOverride !== undefined) {
      const nextMeta = getJsonRecord(doc.metaJson);
      if (body.exportFileNameOverride !== undefined) {
        const exportFileNameOverride =
          typeof body.exportFileNameOverride === "string" && body.exportFileNameOverride.trim()
            ? body.exportFileNameOverride.trim()
            : null;
        if (exportFileNameOverride) nextMeta.exportFileNameOverride = exportFileNameOverride;
        else delete nextMeta.exportFileNameOverride;
      }
      if (body.exportFolderPathOverride !== undefined) {
        const exportFolderPathOverride =
          typeof body.exportFolderPathOverride === "string" && body.exportFolderPathOverride.trim()
            ? body.exportFolderPathOverride.trim()
            : null;
        if (exportFolderPathOverride) nextMeta.exportFolderPathOverride = exportFolderPathOverride;
        else delete nextMeta.exportFolderPathOverride;
      }
      updates.metaJson = nextMeta as Prisma.InputJsonValue;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.document.updateMany({ where: { id: documentId, firmId }, data: updates });
      const nextReviewState =
        updates.reviewState === undefined ? doc.reviewState : (updates.reviewState as DocumentReviewStateValue | null);
      if (nextReviewState !== doc.reviewState) {
        await addDocumentAuditEvent({
          firmId,
          documentId,
          actor,
          action: "review_state_changed",
          fromCaseId: doc.routedCaseId ?? null,
          toCaseId: doc.routedCaseId ?? null,
          metaJson: {
            fromReviewState: doc.reviewState ?? null,
            toReviewState: nextReviewState,
          },
        });
      }
      const nonReviewKeys = Object.keys(updates).filter((key) => key !== "reviewState");
      if (nonReviewKeys.length > 0) {
        await addDocumentAuditEvent({
          firmId,
          documentId,
          actor,
          action: "patched",
          fromCaseId: doc.routedCaseId ?? null,
          toCaseId: doc.routedCaseId ?? null,
          metaJson: { updates: body },
        });
      }
    }

    res.json({ ok: true, id: documentId });
  } catch (e: any) {
    console.error("Failed to patch document", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/documents/:id/preview", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "previewed",
    }))) return;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, mimeType: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    // Only serve preview for PDFs for now
    const mime = doc.mimeType || "";
    if (mime !== "application/pdf") {
      return res.status(415).json({ ok: false, error: "preview only supported for PDFs" });
    }

    // Placeholder: 1x1 transparent PNG. Replace with real PDF thumbnail rendering.
    const transparentPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    const buf = Buffer.from(transparentPngBase64, "base64");

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/documents/:id/duplicates", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "inspected for duplicates",
    }))) return;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, duplicateOfId: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    let original: { id: string; originalName: string } | null = null;
    let duplicates: Array<{ id: string; originalName: string }> = [];

    if (doc.duplicateOfId) {
      const orig = await prisma.document.findFirst({
        where: { id: doc.duplicateOfId, firmId },
        select: { id: true, originalName: true },
      });
      if (orig) original = { id: orig.id, originalName: orig.originalName };
    }

    const dups = await prisma.document.findMany({
      where: { firmId, duplicateOfId: documentId },
      select: { id: true, originalName: true },
      orderBy: { ingestedAt: "desc" },
    });
    duplicates = dups.map((d) => ({ id: d.id, originalName: d.originalName }));

    res.json({ ok: true, original, duplicates });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

async function getDocumentAuditEvents(req: express.Request, res: express.Response): Promise<void> {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "inspected in audit history",
    }))) return;
    const events = await prisma.documentAuditEvent.findMany({
      where: { documentId, firmId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ ok: true, items: events });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

app.get("/documents/:id/audit", auth, requireRole(Role.STAFF), getDocumentAuditEvents);
app.get("/documents/:id/audit-events", auth, requireRole(Role.STAFF), getDocumentAuditEvents);

app.get("/cases/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const c = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId }),
      select: {
        id: true,
        title: true,
        caseNumber: true,
        clientName: true,
        createdAt: true,
        assignedUserId: true,
        assignedUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
    if (!c) return res.status(404).json({ error: "Case not found" });
    res.json({ ok: true, item: c });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/audit", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const events = await prisma.documentAuditEvent.findMany({
      where: {
        firmId,
        OR: [{ fromCaseId: caseId }, { toCaseId: caseId }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ ok: true, items: events });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/insights", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = await ensureVisibleCase(req, res, String(req.params.id ?? ""));
    if (!accessContext) return;
    const { firmId } = accessContext;
    const caseId = String(req.params.id ?? "");
    const allowed = await hasFeature(firmId, "case_insights");
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Case insights add-on is not enabled for this firm.",
      });
    }
    const result = await getCaseInsights(caseId, firmId);
    const items = result.insights.map((insight) => ({
      type: insight.type,
      severity: insight.severity,
      title: insight.summary,
      detail: insight.detail ?? null,
      sourceDocumentIds: insight.documentIds ?? [],
    }));
    res.json({ ok: true, insights: items });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/financial", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const legalCase = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!legalCase) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }

    const [financial, billLineAggregate, latestOffer] = await Promise.all([
      prisma.caseFinancial.findFirst({
        where: { caseId, firmId },
        select: {
          medicalBillsTotal: true,
          liensTotal: true,
          settlementOffer: true,
          settlementAccepted: true,
          attorneyFees: true,
          costs: true,
          netToClient: true,
          updatedAt: true,
        },
      }),
      prisma.medicalBillLineItem.aggregate({
        where: { caseId, firmId },
        _sum: { lineTotal: true },
      }),
      pgPool.query<{ amount: number }>(
        `select (dr.insurance_fields->>'settlementOffer')::float as amount
         from "Document" d
         join document_recognition dr on dr.document_id = d.id
         where d."firmId" = $1 and d."routedCaseId" = $2
           and dr.insurance_fields is not null
           and (dr.insurance_fields->>'settlementOffer') is not null
           and (dr.insurance_fields->>'settlementOffer')::float > 0
         order by coalesce(d."processedAt", d."createdAt") desc
         limit 1`,
        [firmId, caseId]
      ),
    ]);

    const fallbackMedicalBills = decimalToNullableNumber(billLineAggregate._sum.lineTotal) ?? 0;
    const latestSettlementOffer =
      latestOffer.rows[0]?.amount != null && Number.isFinite(Number(latestOffer.rows[0].amount))
        ? Number(latestOffer.rows[0].amount)
        : null;

    res.json({
      ok: true,
      item: {
        medicalBillsTotal: financial?.medicalBillsTotal ?? fallbackMedicalBills,
        liensTotal: financial?.liensTotal ?? 0,
        settlementOffer: financial?.settlementOffer ?? latestSettlementOffer,
        settlementAccepted: financial?.settlementAccepted ?? null,
        attorneyFees: financial?.attorneyFees ?? null,
        costs: financial?.costs ?? null,
        netToClient: financial?.netToClient ?? null,
        updatedAt: toIsoString(financial?.updatedAt),
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/bill-line-items", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const legalCase = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!legalCase) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }

    const items = await prisma.medicalBillLineItem.findMany({
      where: { caseId, firmId },
      orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
    });

    res.json({
      ok: true,
      items: items.map((item) => ({
        id: item.id,
        documentId: item.documentId,
        providerName: item.providerName ?? null,
        serviceDate: toIsoString(item.serviceDate),
        cptCode: item.cptCode ?? null,
        procedureDescription: item.procedureDescription ?? null,
        amountCharged: decimalToNullableNumber(item.amountCharged),
        amountPaid: decimalToNullableNumber(item.amountPaid),
        balance: decimalToNullableNumber(item.balance),
        lineTotal: decimalToNullableNumber(item.lineTotal),
        createdAt: toIsoString(item.createdAt ?? null),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/report", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const pdfBuffer = await buildCaseReportPdf(caseId, firmId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="case-report-${caseId}.pdf"`);
    res.send(pdfBuffer);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/fetch-docket", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const allowed = await hasFeature(firmId, "court_extraction");
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Court extraction add-on is not enabled for this firm.",
      });
    }
    const legalCase = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId }),
      select: { id: true, caseNumber: true },
    });
    if (!legalCase) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }
    const caseNumber = legalCase.caseNumber?.trim() || caseId;
    const result = await fetchCourtDocket(caseNumber, firmId, legalCase.id);
    res.json({ ok: true, imported: result.imported });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

function parseISODate(s: string): Date | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

app.get("/cases/:id/timeline-meta", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const row = await prisma.caseTimelineRebuild.findUnique({
      where: { caseId_firmId: { caseId, firmId } },
      select: { rebuiltAt: true },
    });
    res.json({ ok: true, lastRebuiltAt: row?.rebuiltAt ?? null });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/timeline", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const trackFilter = Array.isArray(req.query.track) ? req.query.track[0] : req.query.track;
    const track = typeof trackFilter === "string" && ["medical", "legal", "insurance"].includes(trackFilter)
      ? trackFilter
      : null;
    const providerFilter = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider;
    const provider = typeof providerFilter === "string" && providerFilter.trim() ? providerFilter.trim() : null;
    const dateFromRaw = Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : req.query.dateFrom;
    const dateToRaw = Array.isArray(req.query.dateTo) ? req.query.dateTo[0] : req.query.dateTo;
    const dateFrom = typeof dateFromRaw === "string" ? parseISODate(dateFromRaw) : null;
    const dateTo = typeof dateToRaw === "string" ? parseISODate(dateToRaw) : null;

    const where: Record<string, unknown> = { caseId, firmId };
    if (track) where.track = track;
    if (provider) where.provider = { contains: provider, mode: "insensitive" };
    if (dateFrom ?? dateTo) {
      where.eventDate = {};
      if (dateFrom) (where.eventDate as Record<string, Date>).gte = dateFrom;
      if (dateTo) (where.eventDate as Record<string, Date>).lte = dateTo;
    }

    const events = await prisma.caseTimelineEvent.findMany({
      where,
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        eventDate: true,
        eventType: true,
        track: true,
        facilityId: true,
        provider: true,
        diagnosis: true,
        procedure: true,
        amount: true,
        documentId: true,
        metadataJson: true,
        createdAt: true,
      },
    });
    res.json({ ok: true, items: events });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/timeline/export", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const formatRaw = Array.isArray(req.query.format) ? req.query.format[0] : req.query.format;
    const format = typeof formatRaw === "string" ? formatRaw.trim().toLowerCase() : "pdf";

    const legalCase = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId }),
      select: { id: true, caseNumber: true, title: true, clientName: true },
    });
    if (!legalCase) {
      return res.status(404).json({ ok: false, error: "Case not found." });
    }

    const baseFileName = [legalCase.caseNumber, legalCase.clientName, legalCase.title]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("-")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || `case-${caseId.slice(-8)}`;

    if (format === "docx") {
      const buffer = await buildTimelineChronologyDocx(caseId, firmId);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${baseFileName}-chronology.docx"`
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      return res.send(buffer);
    }

    if (format !== "pdf") {
      return res.status(400).json({ ok: false, error: "format must be 'pdf' or 'docx'" });
    }

    const buffer = await buildTimelineChronologyPdf(caseId, firmId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${baseFileName}-chronology.pdf"`
    );
    res.setHeader("Content-Type", "application/pdf");
    return res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/timeline/rebuild", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    await enqueueTimelineRebuildJob({ caseId, firmId });
    res.status(202).json({ ok: true, queued: true, message: "Timeline rebuild queued." });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Demand Narrative Assistant ===

const NARRATIVE_TYPES = [
  "treatment_summary",
  "injury_summary",
  "pain_suffering",
  "liability",
  "demand_rationale",
  "response_to_denial",
  "response_to_offer",
  "denial_response", // alias → response_to_denial
] as const;
const NARRATIVE_TONES = ["neutral", "assertive", "aggressive"] as const;

app.post("/cases/:id/narrative", auth, requireRole(Role.STAFF), rateLimitEndpoint(20, "narrative"), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const authRole = accessContext.authRole as Role | undefined;
    const userId = typeof (req as any).userId === "string" ? ((req as any).userId as string) : null;

    const allowed = await hasFeature(firmId, "demand_narratives");
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Demand narratives add-on is not enabled for this firm.",
      });
    }

    const body = (req.body ?? {}) as any;
    const narrativeTypeRaw = body?.narrativeType ?? body?.type;
    const toneRaw = body?.tone;
    const type = NARRATIVE_TYPES.includes(narrativeTypeRaw) ? narrativeTypeRaw : "treatment_summary";
    const tone = NARRATIVE_TONES.includes(toneRaw) ? toneRaw : "neutral";
    const notes = body?.notes != null ? String(body.notes) : undefined;
    const questionnaire = body?.questionnaire != null && typeof body.questionnaire === "object" ? body.questionnaire : undefined;

    const internalType = type === "denial_response" ? "response_to_denial" : type;

    const result = await generateNarrative({
      caseId,
      firmId,
      type: internalType,
      tone,
      createdByUserId: userId ?? null,
      notes,
      questionnaire,
    });

    const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.usageMonthly.upsert({
      where: { firmId_yearMonth: { firmId, yearMonth: ym } },
      create: {
        firmId,
        yearMonth: ym,
        pagesProcessed: 0,
        docsProcessed: 0,
        insuranceDocsExtracted: 0,
        courtDocsExtracted: 0,
        narrativeGenerated: 1,
        duplicateDetected: 0,
      },
      update: { narrativeGenerated: { increment: 1 } },
    });

    const reviewDraft = await prisma.demandNarrativeDraft.create({
      data: {
        firmId,
        caseId,
        narrativeType: type,
        tone,
        demandBankRunId: result.retrievalRunId ?? undefined,
        status: DemandReviewStatus.PENDING_DEV_REVIEW,
        generatedText: result.text,
        warningsJson: (result.warnings ?? []) as Prisma.InputJsonValue,
        usedEventsJson: result.usedEvents as unknown as Prisma.InputJsonValue,
        generatedByUserId: userId ?? undefined,
        generatedAt: new Date(),
      },
    });

    const item = isDemandReviewerRole(authRole)
      ? serializeDemandNarrativeDraft(reviewDraft, authRole)
      : null;
    res.json({
      ok: true,
      status: "pending_dev_review",
      item,
      message: isDemandReviewerRole(authRole)
        ? "Demand draft generated and stored for internal review. Approve and release it when ready."
        : "Demand draft generated and queued for mandatory internal developer review. It remains blocked until a platform reviewer approves and releases it.",
    });
    createNotification(
      firmId,
      "narrative_generated",
      "Demand narrative awaiting internal review",
      `Demand narrative (${type}) was generated for this case and is blocked pending internal developer review.`,
      { caseId, narrativeType: type, demandNarrativeDraftId: reviewDraft.id, status: "pending_dev_review" }
    ).catch((e) => console.warn("[notifications] narrative_generated failed", e));
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/demand-narratives", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const authRole = accessContext.authRole as Role | undefined;

    const items = await prisma.demandNarrativeDraft.findMany({
      where: { firmId, caseId },
      orderBy: [{ createdAt: "desc" }],
    });
    const visibleItems = items.filter((item) => canAccessDemandNarrativeDraft(item.status, authRole));

    res.json({
      ok: true,
      items: visibleItems.map((item) => serializeDemandNarrativeDraft(item, authRole)),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/demand-narratives/:draftId/retrieval-preview", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const authRole = accessContext.authRole as Role | undefined;
    const draftId = String(req.params.draftId ?? "");

    const draft = await prisma.demandNarrativeDraft.findFirst({
      where: { id: draftId, firmId, caseId },
      select: { id: true, status: true },
    });
    if (!draft || !canAccessDemandNarrativeDraft(draft.status, authRole)) {
      return res.status(404).json({ ok: false, error: "Demand narrative draft not found." });
    }

    const preview = await getDemandNarrativeRetrievalPreview(firmId, caseId, draftId);
    res.json({
      ok: true,
      preview,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/demand-narratives/:draftId/retrieval-feedback", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const actorUserId = typeof (req as any).userId === "string" ? ((req as any).userId as string) : null;
    const draftId = String(req.params.draftId ?? "");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const itemType = body.itemType === "document" || body.itemType === "section" ? body.itemType : null;
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    const usefulness =
      body.usefulness === "useful" || body.usefulness === "not_useful" ? body.usefulness : undefined;
    const removed = typeof body.removed === "boolean" ? body.removed : undefined;

    if (!itemType || !itemId || (usefulness === undefined && removed === undefined)) {
      return res.status(400).json({
        ok: false,
        error: "itemType, itemId, and at least one feedback field are required.",
      });
    }

    const preview = await updateDemandNarrativeRetrievalFeedback({
      firmId,
      caseId,
      draftId,
      actorUserId,
      itemType,
      itemId,
      usefulness,
      removed,
    });

    res.json({
      ok: true,
      preview,
    });
  } catch (e: any) {
    const message = String(e?.message || e);
    const status =
      message.includes("not found") || message.includes("does not have stored")
        ? 404
        : message.includes("required")
          ? 400
          : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

app.post("/cases/:id/demand-narratives/:draftId/approve", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const reviewerUserId = typeof (req as any).userId === "string" ? ((req as any).userId as string) : null;
    const draftId = String(req.params.draftId ?? "");

    const draft = await prisma.demandNarrativeDraft.findFirst({
      where: { id: draftId, firmId, caseId },
    });
    if (!draft) {
      return res.status(404).json({ ok: false, error: "Demand narrative draft not found." });
    }
    if (draft.status === DemandReviewStatus.RELEASED_TO_REQUESTER) {
      return res.status(409).json({ ok: false, error: "Demand narrative draft has already been released." });
    }

    const nextStatus = DemandReviewStatus.DEV_APPROVED;
    const approvedAt = draft.approvedAt ?? new Date();

    const updated = await prisma.demandNarrativeDraft.update({
      where: { id: draft.id },
      data: {
        status: nextStatus,
        approvedByUserId: reviewerUserId ?? undefined,
        approvedAt,
      },
    });

    createNotification(
      firmId,
      "narrative_generated",
      "Demand narrative approved",
      `Demand narrative (${updated.narrativeType}) is approved and ready for release.`,
      { caseId, demandNarrativeDraftId: updated.id, status: "dev_approved" }
    ).catch((e) => console.warn("[notifications] narrative_generated failed", e));

    res.json({
      ok: true,
      item: serializeDemandNarrativeDraft(updated, Role.PLATFORM_ADMIN),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/demand-narratives/:draftId/release", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const reviewerUserId = typeof (req as any).userId === "string" ? ((req as any).userId as string) : null;
    const draftId = String(req.params.draftId ?? "");

    const draft = await prisma.demandNarrativeDraft.findFirst({
      where: { id: draftId, firmId, caseId },
    });
    if (!draft) {
      return res.status(404).json({ ok: false, error: "Demand narrative draft not found." });
    }
    if (draft.status !== DemandReviewStatus.DEV_APPROVED && draft.status !== DemandReviewStatus.RELEASED_TO_REQUESTER) {
      return res.status(409).json({
        ok: false,
        error: "Demand narrative draft must be developer-approved before release.",
      });
    }

    const updated =
      draft.status === DemandReviewStatus.RELEASED_TO_REQUESTER
        ? draft
        : await prisma.demandNarrativeDraft.update({
            where: { id: draft.id },
            data: {
              status: DemandReviewStatus.RELEASED_TO_REQUESTER,
              releasedByUserId: reviewerUserId ?? undefined,
              releasedAt: new Date(),
            },
          });

    createNotification(
      firmId,
      "narrative_generated",
      "Demand narrative released",
      `Demand narrative (${updated.narrativeType}) has been released to the requesting team.`,
      { caseId, demandNarrativeDraftId: updated.id, status: "released_to_requester" }
    ).catch((e) => console.warn("[notifications] narrative_generated failed", e));

    res.json({
      ok: true,
      item: serializeDemandNarrativeDraft(updated, Role.PLATFORM_ADMIN),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/demand-packages", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const [legacyDemandNarrativesEnabled, demandDraftsEnabled] = await Promise.all([
      hasFeature(firmId, "demand_narratives"),
      hasFeature(firmId, "demand_drafts_enabled"),
    ]);
    const allowed = legacyDemandNarrativesEnabled || demandDraftsEnabled;
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Demand drafts are not enabled for this firm.",
      });
    }

    const body = (req.body ?? {}) as { title?: string };
    const readiness = await buildDemandPackageReadinessSnapshot(caseId, firmId);
    const normalizedTitle =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim().slice(0, 180)
        : readiness.suggestedTitle;

    const created = await prisma.demandPackage.create({
      data: {
        firmId,
        caseId,
        title: normalizedTitle,
        status: "draft",
      },
      select: {
        id: true,
        title: true,
        status: true,
        generatedDocId: true,
        generatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const job = await enqueueJob({
      firmId,
      type: "demand_package.generate",
      payload: {
        demandPackageId: created.id,
        firmId,
      },
      priority: 60,
    });

    logActivity({
      firmId,
      caseId,
      type: "demand_package_requested",
      title: "Demand package queued",
      meta: {
        demandPackageId: created.id,
        jobId: job.id,
        warnings: readiness.warnings,
        stats: readiness.stats,
      },
    });

    res.status(202).json({
      ok: true,
      item: serializeDemandPackageReviewItem(created),
      limitations: readiness,
      jobId: job.id,
      message:
        readiness.warnings.length > 0
          ? "Demand package queued. Missing-data limitations were detected and returned with the job."
          : "Demand package queued for generation.",
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/demand-packages", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const [legacyDemandNarrativesEnabled, demandDraftsEnabled] = await Promise.all([
      hasFeature(firmId, "demand_narratives"),
      hasFeature(firmId, "demand_drafts_enabled"),
    ]);
    const allowed = legacyDemandNarrativesEnabled || demandDraftsEnabled;
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Demand drafts are not enabled for this firm.",
      });
    }

    const packages = await prisma.demandPackage.findMany({
      where: { firmId, caseId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        generatedDocId: true,
        generatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      ok: true,
      items: packages.map((pkg) => serializeDemandPackageReviewItem(pkg)),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/missing-records-analysis", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const allowed = await hasFeature(firmId, "missing_records_enabled");
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Missing records analysis is not enabled for this firm.",
      });
    }

    const result = await analyzeMissingRecords(caseId, firmId);
    res.json({ ok: true, item: result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/bills-vs-treatment-analysis", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const allowed = await hasFeature(firmId, "bills_vs_treatment_enabled");
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Bills vs treatment analysis is not enabled for this firm.",
      });
    }

    const result = await analyzeBillsVsTreatment(caseId, firmId);
    res.json({ ok: true, item: result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/qa", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const allowed = await hasFeature(firmId, "case_qa_enabled");
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Case Q&A is not enabled for this firm.",
      });
    }

    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) {
      return res.status(400).json({ ok: false, error: "question is required" });
    }

    const result = await answerCaseQuestion(caseId, firmId, question);
    res.json({ ok: true, item: result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/demand-packages/:packageId/approve", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const packageId = String(req.params.packageId ?? "");

    const demandPackage = await prisma.demandPackage.findFirst({
      where: { id: packageId, firmId, caseId },
      select: {
        id: true,
        title: true,
        status: true,
        generatedDocId: true,
        generatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!demandPackage) {
      return res.status(404).json({ ok: false, error: "Demand package not found." });
    }

    const normalizedStatus = normalizeDemandPackageStatus(demandPackage.status);
    if (!demandPackage.generatedDocId || demandPackage.generatedAt == null || normalizedStatus === null) {
      return res.status(409).json({
        ok: false,
        error: "Demand package must finish generating before developer approval.",
      });
    }
    if (normalizedStatus === "released_to_requester") {
      return res.status(409).json({ ok: false, error: "Demand package has already been released." });
    }

    const updated =
      normalizedStatus === "dev_approved"
        ? demandPackage
        : await prisma.demandPackage.update({
            where: { id: demandPackage.id },
            data: { status: "dev_approved" },
            select: {
              id: true,
              title: true,
              status: true,
              generatedDocId: true,
              generatedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          });

    createNotification(
      firmId,
      "demand_package_ready",
      "Demand package approved",
      `Demand package "${updated.title}" is approved and ready for release.`,
      {
        caseId,
        demandPackageId: updated.id,
        documentId: updated.generatedDocId,
        status: "dev_approved",
      }
    ).catch(() => {});

    res.json({
      ok: true,
      item: serializeDemandPackageReviewItem(updated),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/demand-packages/:packageId/release", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const packageId = String(req.params.packageId ?? "");

    const demandPackage = await prisma.demandPackage.findFirst({
      where: { id: packageId, firmId, caseId },
      select: {
        id: true,
        title: true,
        status: true,
        generatedDocId: true,
        generatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!demandPackage) {
      return res.status(404).json({ ok: false, error: "Demand package not found." });
    }

    const normalizedStatus = normalizeDemandPackageStatus(demandPackage.status);
    if (!demandPackage.generatedDocId || demandPackage.generatedAt == null || normalizedStatus === null) {
      return res.status(409).json({
        ok: false,
        error: "Demand package must finish generating before release.",
      });
    }
    if (
      normalizedStatus !== "dev_approved" &&
      normalizedStatus !== "released_to_requester"
    ) {
      return res.status(409).json({
        ok: false,
        error: "Demand package must be developer-approved before release.",
      });
    }

    const updated =
      normalizedStatus === "released_to_requester"
        ? demandPackage
        : await prisma.demandPackage.update({
            where: { id: demandPackage.id },
            data: { status: "released_to_requester" },
            select: {
              id: true,
              title: true,
              status: true,
              generatedDocId: true,
              generatedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          });

    createNotification(
      firmId,
      "demand_package_ready",
      "Demand package released",
      `Demand package "${updated.title}" has been released to the requesting team.`,
      {
        caseId,
        demandPackageId: updated.id,
        documentId: updated.generatedDocId,
        status: "released_to_requester",
      }
    ).catch(() => {});

    res.json({
      ok: true,
      item: serializeDemandPackageReviewItem(updated),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/rebuild-timeline", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    await enqueueTimelineRebuildJob({ caseId, firmId });
    res.status(202).json({ ok: true, queued: true, message: "Timeline rebuild queued." });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/push-test", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const result = await pushCrmWebhook({
      firmId,
      caseId,
      title: "Case Intelligence Update (Test)",
      bodyMarkdown: "This is a **test message** from Doc Platform. If you see this, your webhook is configured correctly.",
      meta: { actionType: "push_test" },
    });
    if (result.ok) {
      res.json({ ok: true, message: "Test message sent." });
    } else {
      const isConfig = result.error?.toLowerCase().includes("not configured");
      res.status(isConfig ? 400 : 502).json({ ok: false, error: result.error });
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case ↔ Provider linkage ===

app.get("/cases/:id/providers", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const links = await prisma.caseProvider.findMany({
      where: { firmId, caseId },
      include: {
        provider: { select: { id: true, name: true, address: true, city: true, state: true, phone: true, fax: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ok: true,
      items: links.map((l) => ({
        id: l.id,
        providerId: l.providerId,
        relationship: l.relationship,
        createdAt: l.createdAt.toISOString(),
        provider: l.provider,
      })),
    });
  } catch (e: any) {
    console.error("Failed to list case providers", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/providers", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const body = (req.body ?? {}) as { providerId?: string; relationship?: string };

    const providerId = body.providerId ? String(body.providerId) : "";
    if (!providerId) return res.status(400).json({ error: "providerId is required" });

    const rel = String(body.relationship ?? "").toLowerCase();
    const relationship = ["treating", "referral", "lien", "records_only"].includes(rel) ? rel : "treating";

    const p = await prisma.provider.findFirst({ where: { id: providerId, firmId }, select: { id: true } });
    if (!p) return res.status(404).json({ error: "Provider not found" });

    const created = await prisma.caseProvider.upsert({
      where: { firmId_caseId_providerId: { firmId, caseId, providerId } },
      create: { firmId, caseId, providerId, relationship },
      update: { relationship },
      include: {
        provider: { select: { id: true, name: true, address: true, city: true, state: true, phone: true, fax: true, email: true } },
      },
    });

    res.status(201).json({
      ok: true,
      item: {
        id: created.id,
        providerId: created.providerId,
        relationship: created.relationship,
        createdAt: created.createdAt.toISOString(),
        provider: created.provider,
      },
    });
  } catch (e: any) {
    console.error("Failed to attach provider to case", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete("/cases/:id/providers/:providerId", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const providerId = String(req.params.providerId ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const deleted = await prisma.caseProvider.deleteMany({
      where: { firmId, caseId, providerId },
    });

    if (deleted.count === 0) return res.status(404).json({ error: "Provider not linked to this case" });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ error: "Provider not linked to this case" });
    console.error("Failed to detach provider from case", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Records requests ===

app.post("/cases/:id/records-requests", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const createResult = await createRecordsRequestDraft({
      firmId,
      caseId,
      providerId: typeof body.providerId === "string" ? body.providerId : null,
      providerName: typeof body.providerName === "string" ? body.providerName : null,
      providerContact: typeof body.providerContact === "string" ? body.providerContact : null,
      requestedDateFrom: typeof body.dateFrom === "string" ? new Date(body.dateFrom) : null,
      requestedDateTo: typeof body.dateTo === "string" ? new Date(body.dateTo) : null,
      createdByUserId: (req as any).userId ?? null,
    });
    if (!createResult.ok) {
      return res.status(400).json({ ok: false, error: createResult.error });
    }

    const patchData: Prisma.RecordsRequestUpdateInput = {};
    if (body.notes !== undefined) {
      patchData.notes = body.notes == null ? null : String(body.notes);
    }
    if (body.providerContact !== undefined) {
      patchData.providerContact = body.providerContact == null ? null : String(body.providerContact);
    }
    if (Object.keys(patchData).length > 0) {
      await prisma.recordsRequest.update({
        where: { id: createResult.id },
        data: patchData,
      });
    }

    const request = await getRequestWithRelations(createResult.id, firmId);
    if (!request) {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }

    res.status(201).json({ ok: true, item: serializeCompatibilityRecordsRequest(request) });
  } catch (e: any) {
    console.error("Failed to create records request", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/records-requests", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const items = await prisma.recordsRequest.findMany({
      where: { firmId, caseId },
      include: { attachments: true, events: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, items: items.map((item) => serializeCompatibilityRecordsRequest(item)) });
  } catch (e: any) {
    console.error("Failed to list records requests", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case offers (settlement offers aggregated over time) ===

app.get("/cases/:id/offers", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const { rows } = await pgPool.query<{
      document_id: string;
      original_name: string;
      created_at: Date;
      processed_at: Date | null;
      amount: number;
    }>(
      `select d.id as document_id, d."originalName" as original_name, d."createdAt" as created_at, d."processedAt" as processed_at,
              (dr.insurance_fields->>'settlementOffer')::float as amount
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d."firmId" = $1 and d."routedCaseId" = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d."processedAt", d."createdAt") desc`,
      [firmId, caseId]
    );

    const offers = rows.map((r) => ({
      documentId: r.document_id,
      originalName: r.original_name,
      date: (r.processed_at ?? r.created_at).toISOString(),
      amount: Number(r.amount),
    }));

    const latest = offers.length > 0 ? offers[0] : null;

    res.json({ ok: true, offers, latest });
  } catch (e: any) {
    console.error("Failed to list case offers", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/offers/export-pdf", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;

    const c = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId }),
      select: { id: true, caseNumber: true, clientName: true },
    });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const { rows } = await pgPool.query<{
      document_id: string;
      original_name: string;
      created_at: Date;
      processed_at: Date | null;
      amount: number;
    }>(
      `select d.id as document_id, d."originalName" as original_name, d."createdAt" as created_at, d."processedAt" as processed_at,
              (dr.insurance_fields->>'settlementOffer')::float as amount
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d."firmId" = $1 and d."routedCaseId" = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d."processedAt", d."createdAt") desc`,
      [firmId, caseId]
    );

    const offers = rows.map((r) => ({
      documentId: r.document_id,
      originalName: r.original_name,
      date: (r.processed_at ?? r.created_at).toISOString(),
      amount: Number(r.amount),
    }));

    const pdf = await buildOffersSummaryPdf({
      caseNumber: c.caseNumber,
      clientName: c.clientName,
      offers,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="offers-${c.caseNumber || caseId}.pdf"`
    );
    res.send(pdf);
  } catch (e: any) {
    console.error("Failed to export offers PDF", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case documents ===

app.get("/cases/:id/documents", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const authRole = accessContext.authRole as Role | undefined;
    const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : null;
    if (qFirmId && qFirmId !== firmId) {
      return res.status(403).json({ ok: false, error: "firmId mismatch" });
    }

    const items = await prisma.document.findMany({
      where: { firmId, routedCaseId: caseId },
      select: {
        id: true,
        originalName: true,
        status: true,
        reviewState: true,
        routedCaseId: true,
        processedAt: true,
        processingStage: true,
        createdAt: true,
        pageCount: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const normalizedStatusById = await normalizeLegacyDocumentStatuses(firmId, items);
    const visibleItems = await filterVisibleDemandPackageDocuments(firmId, authRole, items);

    res.json({
      ok: true,
      items: visibleItems.map((item) => ({
        id: item.id,
        originalName: item.originalName,
        status: normalizedStatusById.get(item.id) ?? item.status,
        reviewState: getEffectiveDocumentReviewState(item),
        createdAt: item.createdAt,
        pageCount: item.pageCount,
      })),
    });
  } catch (e: any) {
    console.error("Failed to list case documents", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/documents/attach", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const actor = (req as any).apiKeyPrefix || "user";
    const body = (req.body ?? {}) as { firmId?: string; documentId?: string };

    const documentId = body.documentId ? String(body.documentId) : "";
    if (!documentId) return res.status(400).json({ error: "documentId is required" });
    if (body.firmId && body.firmId !== firmId) {
      return res.status(403).json({ ok: false, error: "firmId mismatch" });
    }

    const result = await routeDocument(firmId, documentId, caseId, {
      actor,
      action: "attached_to_case",
      routedSystem: "manual",
      routingStatus: "routed",
      reviewState: "APPROVED",
      status: "UPLOADED",
    });
    if (!result.ok) return res.status(404).json({ ok: false, error: result.error });

    const updated = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, originalName: true, status: true, reviewState: true, createdAt: true, pageCount: true },
    });

    res.status(201).json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("Failed to attach document to case", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/documents/upload", auth, requireRole(Role.STAFF), upload.single("file"), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const actor = (req as any).apiKeyPrefix || "user";
    const file = req.file;
    const trace = createFastPathTrace(res, "cases_upload", { firmId, caseId });

    if (!file) return res.status(400).json({ error: "Missing file (multipart field name must be 'file')" });

    const docLimitCheck = await canIngestDocument(firmId);
    if (!docLimitCheck.allowed) {
      return res.status(402).json({
        ok: false,
        error: docLimitCheck.error,
        billingStatus: docLimitCheck.billingStatus,
        billing: buildUploadBillingPayload(docLimitCheck),
      });
    }

    const fileSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const fileSizeBytes = file.buffer.length;
    const documentId = crypto.randomUUID();
    const key = buildDocumentStorageKey({
      firmId,
      caseId,
      documentId,
      originalName: file.originalname,
    });

    await putObject(key, file.buffer, file.mimetype || "application/octet-stream");

    const doc = await prisma.document.create({
      data: {
        id: documentId,
        firmId,
        source: "case_upload",
        spacesKey: key,
        originalName: file.originalname,
        mimeType: file.mimetype || "application/octet-stream",
        pageCount: 0,
        status: "RECEIVED",
        routedCaseId: caseId,
        routedSystem: "manual",
        routingStatus: "routed",
        external_id: null,
        file_sha256: fileSha256,
        fileSizeBytes,
        ingestedAt: new Date(),
      },
    });
    trace.mark("persistence_complete", {
      documentId: doc.id,
      routedCaseId: caseId,
    });

    await addDocumentAuditEvent({
      firmId,
      documentId: doc.id,
      actor,
      action: "uploaded_to_case",
      fromCaseId: null,
      toCaseId: caseId,
      metaJson: { caseId, source: "case_upload" },
    });
    trace.mark("audit_complete", {
      documentId: doc.id,
    });

    await Promise.all([
      enqueueDocumentJob({ documentId: doc.id, firmId }),
      enqueueTimelineRebuildJob({ caseId, firmId }).catch((e) => {
        console.warn("[case_upload] timeline rebuild enqueue failed", { caseId, documentId: doc.id, err: e });
      }),
    ]);
    trace.mark("enqueue_complete", {
      documentId: doc.id,
      queuedJobs: ["ocr", "timeline_rebuild"],
    });

    res.status(201).json({
      ok: true,
      documentId: doc.id,
      item: {
        id: doc.id,
        originalName: doc.originalName,
        status: doc.status,
        createdAt: doc.createdAt,
        pageCount: doc.pageCount,
      },
      billing: buildUploadBillingPayload(docLimitCheck),
    });
  } catch (e: any) {
    console.error("Failed to upload document to case", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/documents", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const body = (req.body ?? {}) as { documentId?: string };

    const documentId = body.documentId ? String(body.documentId) : "";
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const result = await routeDocument(firmId, documentId, caseId, {
      actor: (req as any).apiKeyPrefix || "user",
      action: "attached_to_case",
      routedSystem: "manual",
      routingStatus: "routed",
      reviewState: "APPROVED",
      status: "UPLOADED",
    });
    if (!result.ok) return res.status(404).json({ ok: false, error: result.error });

    const updated = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, originalName: true, status: true, createdAt: true, pageCount: true },
    });

    res.status(201).json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("Failed to attach document to case", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case tasks (PATCH /cases/tasks/:id must come before /cases/:id to avoid "tasks" as caseId) ===
app.patch("/cases/tasks/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const taskId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { firmId?: string; completed?: boolean };

    if (typeof body.completed !== "boolean") {
      return res.status(400).json({ ok: false, error: "completed (boolean) is required" });
    }
    if (body.firmId && body.firmId !== firmId) {
      return res.status(403).json({ ok: false, error: "firmId mismatch" });
    }

    const existing = await prisma.caseTask.findFirst({
      where: { id: taskId, firmId },
      select: { id: true, caseId: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: "Task not found" });
    const accessContext = await ensureVisibleCase(req, res, existing.caseId);
    if (!accessContext) return;

    const updated = await prisma.caseTask.update({
      where: { id: taskId },
      data: { completedAt: body.completed ? new Date() : null, updatedAt: new Date() },
    });
    res.json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("Failed to update case task", e);
    logSystemError("api", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case notes ===

app.get("/cases/:id/notes", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : firmId;
    if (qFirmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const items = await prisma.caseNote.findMany({
      where: { caseId, firmId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, items });
  } catch (e: any) {
    console.error("Failed to list case notes", e);
    logSystemError("api", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/notes", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const body = (req.body ?? {}) as { firmId?: string; body?: string; authorUserId?: string };

    const noteBody = body.body != null ? String(body.body) : "";
    if (!noteBody.trim()) return res.status(400).json({ ok: false, error: "body is required" });
    if (body.firmId && body.firmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const created = await prisma.caseNote.create({
      data: { caseId, firmId, body: noteBody.trim(), authorUserId: body.authorUserId || null },
    });

    res.status(201).json({ ok: true, item: created });
  } catch (e: any) {
    console.error("Failed to create case note", e);
    logSystemError("api", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case tasks ===
app.get("/cases/:id/tasks", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : firmId;
    if (qFirmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const items = await prisma.caseTask.findMany({
      where: { caseId, firmId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    res.json({ ok: true, items });
  } catch (e: any) {
    console.error("Failed to list case tasks", e);
    logSystemError("api", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/tasks", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const caseId = String(req.params.id ?? "");
    const accessContext = await ensureVisibleCase(req, res, caseId);
    if (!accessContext) return;
    const { firmId } = accessContext;
    const body = (req.body ?? {}) as { firmId?: string; title?: string; dueDate?: string };

    const title = body.title != null ? String(body.title).trim() : "";
    if (!title) return res.status(400).json({ ok: false, error: "title is required" });
    if (body.firmId && body.firmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    const created = await prisma.caseTask.create({
      data: { caseId, firmId, title, dueDate },
    });
    res.status(201).json({ ok: true, item: created });
  } catch (e: any) {
    console.error("Failed to create case task", e);
    logSystemError("api", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.get("/metrics/review", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const rangeRaw = Array.isArray((req.query as any).range)
      ? (req.query as any).range[0]
      : (req.query as any).range;
    const rangeStr = String(rangeRaw ?? "7d");
    const daysMatch = /^(\d+)d$/.exec(rangeStr);
    const rangeDays = daysMatch ? Math.max(1, Math.min(30, parseInt(daysMatch[1], 10))) : 7;

    const now = new Date();
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (rangeDays - 1));
    start.setUTCHours(0, 0, 0, 0);

    // Per-day ingested
    const ingResult = await pgPool.query(
      `
      select date("createdAt") as day, count(*)::int as count
      from "Document"
      where "firmId" = $1
        and "createdAt" between $2 and $3
      group by date("createdAt")
      order by day
      `,
      [firmId, start, end]
    );

    // Per-day routed (manual route events)
    const routedResult = await pgPool.query(
      `
      select date("createdAt") as day, count(*)::int as count
      from "DocumentAuditEvent"
      where "firmId" = $1
        and action = 'routed'
        and "createdAt" between $2 and $3
      group by date("createdAt")
      order by day
      `,
      [firmId, start, end]
    );

    // Durations between ingest and routed
    const durResult = await pgPool.query(
      `
      select d."createdAt" as created_at, e."createdAt" as routed_at
      from "Document" d
      join "DocumentAuditEvent" e
        on e."documentId" = d.id
       and e."firmId" = d."firmId"
      where d."firmId" = $1
        and e.action = 'routed'
        and e."createdAt" between $2 and $3
      `,
      [firmId, start, end]
    );

    const durationsSeconds: number[] = durResult.rows
      .map((r) => {
        const createdAt = new Date(r.created_at as string);
        const routedAt = new Date(r.routed_at as string);
        const diffMs = routedAt.getTime() - createdAt.getTime();
        return diffMs > 0 ? diffMs / 1000 : null;
      })
      .filter((v): v is number => v != null);

    durationsSeconds.sort((a, b) => a - b);
    let medianSeconds: number | null = null;
    if (durationsSeconds.length > 0) {
      const mid = Math.floor(durationsSeconds.length / 2);
      if (durationsSeconds.length % 2 === 0) {
        medianSeconds = (durationsSeconds[mid - 1] + durationsSeconds[mid]) / 2;
      } else {
        medianSeconds = durationsSeconds[mid];
      }
    }

    // Current queue size (NEEDS_REVIEW)
    const currentQueueSize = await prisma.document.count({
      where: {
        firmId,
        OR: [
          { reviewState: "IN_REVIEW" },
          {
            reviewState: null,
            status: { in: ["NEEDS_REVIEW", "UPLOADED"] },
            OR: [{ routingStatus: null }, { routingStatus: "needs_review" }],
          },
        ],
      },
    });

    // Top facilities/providers by extractedFields JSON
    const topFacilitiesResult = await pgPool
      .query(
        `
        select coalesce(("extractedFields"->>'facility'), 'Unknown') as facility,
               count(*)::int as count
        from "Document"
        where "firmId" = $1
          and "createdAt" between $2 and $3
        group by facility
        order by count desc
        limit 5
        `,
        [firmId, start, end]
      )
      .catch(() => ({ rows: [] as any[] }));

    const topProvidersResult = await pgPool
      .query(
        `
        select coalesce(("extractedFields"->>'provider'), 'Unknown') as provider,
               count(*)::int as count
        from "Document"
        where "firmId" = $1
          and "createdAt" between $2 and $3
        group by provider
        order by count desc
        limit 5
        `,
        [firmId, start, end]
      )
      .catch(() => ({ rows: [] as any[] }));

    // Build per-day buckets
    type DayRow = { day: string; count: number };
    const ingByDay = new Map<string, number>(
      (ingResult.rows as DayRow[]).map((r) => [String(r.day), r.count])
    );
    const routedByDay = new Map<string, number>(
      (routedResult.rows as DayRow[]).map((r) => [String(r.day), r.count])
    );

    const perDay: Array<{
      day: string;
      ingested: number;
      routed: number;
      queueSize: number;
    }> = [];

    let cumulativeIngested = 0;
    let cumulativeRouted = 0;

    const dayCursor = new Date(start);
    while (dayCursor <= end) {
      const dayKey = dayCursor.toISOString().slice(0, 10);
      const ing = ingByDay.get(dayKey) ?? 0;
      const routed = routedByDay.get(dayKey) ?? 0;
      cumulativeIngested += ing;
      cumulativeRouted += routed;
      const queueSize = Math.max(0, cumulativeIngested - cumulativeRouted);
      perDay.push({
        day: dayKey,
        ingested: ing,
        routed,
        queueSize,
      });
      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    }

    const totalIngested = perDay.reduce((acc, d) => acc + d.ingested, 0);
    const totalRouted = perDay.reduce((acc, d) => acc + d.routed, 0);

    res.json({
      ok: true,
      rangeDays,
      summary: {
        totalIngested,
        totalRouted,
        medianSeconds,
        medianMinutes: medianSeconds != null ? medianSeconds / 60 : null,
        currentQueueSize,
        topFacilities: topFacilitiesResult.rows.map((r: any) => ({
          facility: r.facility,
          count: Number(r.count ?? 0),
        })),
        topProviders: topProvidersResult.rows.map((r: any) => ({
          provider: r.provider,
          count: Number(r.count ?? 0),
        })),
      },
      perDay,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get recognition result for a document (firm-scoped)
app.get("/documents/:id/recognition", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    if (!(await enforceDemandPackageDocumentAccess(res, {
      firmId,
      documentId,
      authRole: (req as any).authRole as Role | undefined,
      action: "read in recognition",
    }))) return;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: {
        id: true,
        originalName: true,
        status: true,
        reviewState: true,
        routedCaseId: true,
        routingStatus: true,
        mimeType: true,
        confidence: true,
        extractedFields: true,
        duplicateMatchCount: true,
        duplicateOfId: true,
        pageCount: true,
        ingestedAt: true,
        processedAt: true,
        processingStage: true,
      },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }
    const normalizedStatus = getNormalizedDocumentStatus(doc) ?? doc.status;
    if (normalizedStatus !== doc.status) {
      await prisma.document.updateMany({
        where: { id: documentId, firmId },
        data: { status: normalizedStatus as DocumentStatus },
      });
    }

    const { rows } = await pgPool.query(
      `select document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, match_confidence, match_reason, risks, insights, insurance_fields, court_fields, updated_at
       from document_recognition where document_id = $1`,
      [documentId]
    );
    const rec = rows[0] || null;

    res.json({
      ok: true,
      document: {
        id: doc.id,
        originalName: doc.originalName,
        status: normalizedStatus,
        reviewState: getEffectiveDocumentReviewState(doc),
        routedCaseId: doc.routedCaseId ?? null,
        routingStatus: doc.routingStatus ?? null,
        mimeType: doc.mimeType ?? null,
        confidence: doc.confidence,
        extractedFields: doc.extractedFields,
        lastRunAt: rec?.updated_at ?? null,
        errors: doc.status === "FAILED" ? "Document processing failed" : null,
        duplicateMatchCount: doc.duplicateMatchCount ?? 0,
        duplicateOfId: doc.duplicateOfId ?? null,
        pageCount: doc.pageCount ?? 0,
        ingestedAt: doc.ingestedAt?.toISOString?.() ?? null,
      },
      recognition: rec
        ? {
            docType: rec.doc_type,
            clientName: rec.client_name,
            caseNumber: rec.case_number,
            incidentDate: rec.incident_date,
            confidence: rec.confidence,
            textExcerpt: rec.text_excerpt,
            excerptLength: (rec.text_excerpt || "").length,
            updatedAt: rec.updated_at,
            lastRunAt: rec.updated_at,
            matchConfidence: rec.match_confidence != null ? Number(rec.match_confidence) : null,
            matchReason: rec.match_reason ?? null,
            risks: rec.risks != null ? (Array.isArray(rec.risks) ? rec.risks : (rec.risks as any)?.risks ?? []) : [],
            insights: rec.insights != null ? (Array.isArray(rec.insights) ? rec.insights : (rec.insights as any)?.insights ?? []) : [],
            insuranceFields: rec.insurance_fields ?? null,
            courtFields: rec.court_fields ?? null,
          }
        : null,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post(
  "/documents/:id/explain",
  auth,
  requireRole(Role.STAFF),
  rateLimitEndpoint(30, "document_explain"),
  async (req, res) => {
    try {
      const firmId = (req as any).firmId as string;
      const documentId = String(req.params.id ?? "");
      if (!(await enforceDemandPackageDocumentAccess(res, {
        firmId,
        documentId,
        authRole: (req as any).authRole as Role | undefined,
        action: "explained",
      }))) return;
      const body = (req.body ?? {}) as { firmId?: string; question?: string };
      const question = typeof body.question === "string" ? body.question.trim() : undefined;

        const doc = await prisma.document.findFirst({
          where: { id: documentId, firmId },
          select: { id: true, firmId: true, extractedFields: true, routedCaseId: true },
        });
      if (!doc) {
        return res.status(404).json({ ok: false, error: "document not found" });
      }

      const { rows } = await pgPool.query<{
        text_excerpt: string | null;
        normalized_text_hash: string | null;
        extracted_json: unknown;
      }>(
        `select text_excerpt, normalized_text_hash, extracted_json from document_recognition where document_id = $1`,
        [documentId]
      );
      const rec = rows[0] ?? null;
      const ocrText = rec?.text_excerpt ?? null;
      const textHash = rec?.normalized_text_hash ?? getStoredTextHash(ocrText);
      const explainTaskKey = buildTaskCacheKey(
        DOCUMENT_RECOGNITION_TASKS.explain,
        computeDocumentExplainVariant(question ?? "")
      );

      const explainResolution = await resolveTaskCache({
        extractedJson: rec?.extracted_json ?? null,
        taskKey: explainTaskKey,
        textHash,
        firmId,
        documentId,
        existingValue: { bullets: [] as string[] },
          compute: () =>
            explainDocument(ocrText, doc.extractedFields ?? null, question, {
              firmId,
              documentId,
              caseId: doc.routedCaseId ?? null,
              source: "documents.explain",
            }),
          persistOutput: true,
          logContext: { source: "documents.explain", documentId },
          telemetryContext: { firmId, documentId, caseId: doc.routedCaseId ?? null, source: "documents.explain" },
          ...DOCUMENT_RECOGNITION_PROMPTS.explain,
        });
      const result = explainResolution.value;

      if (!explainResolution.reused) {
        await pgPool.query(
          `
          update document_recognition set
            normalized_text_hash = $1,
            extracted_json = $2,
            updated_at = now()
          where document_id = $3
          `,
          [textHash, explainResolution.extractedJson, documentId]
        );
      }

      if (!explainResolution.reused) {
        const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
        await prisma.usageMonthly.upsert({
          where: { firmId_yearMonth: { firmId, yearMonth: ym } },
          create: {
            firmId,
            yearMonth: ym,
            pagesProcessed: 0,
            docsProcessed: 0,
            insuranceDocsExtracted: 0,
            courtDocsExtracted: 0,
            narrativeGenerated: 1,
            duplicateDetected: 0,
          },
          update: { narrativeGenerated: { increment: 1 } },
        });
      }

      res.json({
        ok: true,
        ...result,
        cacheUsed: explainResolution.meta.cacheUsed,
        cache: explainResolution.meta,
      });
    } catch (e: any) {
      console.error("[documents/explain]", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

app.get("/mailboxes/recent-ingests", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 100);

    const { rows } = await pgPool.query(
      `
      select
        ea.id,
        ea.ingest_document_id as document_id,
        em.from_email as "from",
        em.subject,
        em.received_at as received_at,
        d.status as document_status,
        em.mailbox_connection_id as mailbox_id
      from email_attachments ea
      join email_messages em on em.id = ea.email_message_id
      join mailbox_connections mc on mc.id = em.mailbox_connection_id and mc.firm_id = $1
      left join "Document" d on d.id = ea.ingest_document_id
      order by em.received_at desc nulls last, ea.created_at desc
      limit $2
      `,
      [firmId, limit]
    );

    res.json({
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        documentId: r.document_id,
        from: r.from,
        subject: r.subject,
        receivedAt: r.received_at,
        status: r.document_status ?? "—",
        mailboxId: r.mailbox_id,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/mailboxes/:id/recent-ingests", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const mailboxId = req.params.id;

    const { rows: mb } = await pgPool.query(
      `select id from mailbox_connections where id = $1 and firm_id = $2 limit 1`,
      [mailboxId, firmId]
    );
    if (!mb.length) {
      return res.status(404).json({ ok: false, error: "mailbox not found" });
    }

    const { rows } = await pgPool.query(
      `
      select
        ea.id,
        ea.filename,
        ea.sha256,
        ea.ingest_document_id,
        em.subject,
        em.from_email,
        em.received_at,
        ea.created_at,
        d.status as document_status
      from email_attachments ea
      join email_messages em on em.id = ea.email_message_id
      left join "Document" d on d.id = ea.ingest_document_id
      where em.mailbox_connection_id = $1
      order by ea.created_at desc
      limit 20
      `,
      [mailboxId]
    );

    res.json({
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        sha256: r.sha256,
        documentId: r.ingest_document_id,
        subject: r.subject,
        from: r.from_email,
        receivedAt: r.received_at,
        createdAt: r.created_at,
        status: r.document_status ?? "—",
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/mailboxes/:id/poll-now", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const mailboxId = String(req.params.id ?? "");

    const { rows } = await pgPool.query(
      `select id from mailbox_connections where id = $1 and firm_id = $2 limit 1`,
      [mailboxId, firmId]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "mailbox not found" });
    }

    const { runEmailPollForMailbox } = await import("../email/emailIngestRunner");
    await runEmailPollForMailbox(mailboxId);
    res.json({ ok: true, message: "Poll completed" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/mailboxes/:id/test", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const mailboxId = req.params.id;

    const { rows } = await pgPool.query(
      `select id, firm_id, imap_host, imap_port, imap_secure, imap_username, imap_password, folder
       from mailbox_connections where id = $1 and firm_id = $2 limit 1`,
      [mailboxId, firmId]
    );
    const mb = rows[0];
    if (!mb || mb.firm_id !== firmId) {
      return res.status(404).json({ ok: false, error: "mailbox not found" });
    }
    if (!mb.imap_host || !mb.imap_username || !mb.imap_password) {
      return res.status(400).json({ ok: false, error: "mailbox missing host/username/password" });
    }

    const result = await testImapConnection({
      host: mb.imap_host,
      port: mb.imap_port || 993,
      secure: mb.imap_secure !== false,
      auth: { user: mb.imap_username, pass: mb.imap_password },
      mailbox: mb.folder || "INBOX",
    });

    if (result.ok) {
      res.json({ ok: true });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/mailboxes/:id", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const mailboxId = req.params.id;
    const body = (req.body ?? {}) as { status?: string; enabled?: boolean };

    let status: string | null = null;
    if (body.enabled === true) status = "active";
    else if (body.enabled === false) status = "paused";
    else if (body.status === "paused") status = "paused";
    else if (body.status === "active") status = "active";
    if (status === null) {
      return res.status(400).json({ error: "Provide status ('active'|'paused') or enabled (boolean)" });
    }

    const { rowCount } = await pgPool.query(
      `update mailbox_connections set status = $1, updated_at = now() where id = $2 and firm_id = $3`,
      [status, mailboxId, firmId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ ok: false, error: "mailbox not found" });
    }
    res.json({ ok: true, status });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /mailboxes — create mailbox (API key, firmId from key)
app.post("/mailboxes", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as {
      imapHost?: string;
      imapPort?: number;
      imapSecure?: boolean;
      imapUsername?: string;
      imapPassword?: string;
      folder?: string;
    };
    if (!body.imapHost?.trim() || !body.imapUsername?.trim() || body.imapPassword == null) {
      return res.status(400).json({
        ok: false,
        error: "imapHost, imapUsername, and imapPassword are required",
      });
    }
    const id = "mb_" + crypto.randomBytes(12).toString("hex");
    const imapPort = typeof body.imapPort === "number" ? body.imapPort : 993;
    const imapSecure = body.imapSecure !== false;
    const folder = (body.folder ?? "INBOX").toString().trim() || "INBOX";

    await pgPool.query(
      `
      insert into mailbox_connections (id, firm_id, provider, imap_host, imap_port, imap_secure, imap_username, imap_password, folder, status, updated_at)
      values ($1, $2, 'imap', $3, $4, $5, $6, $7, $8, 'active', now())
      `,
      [id, firmId, body.imapHost.trim(), imapPort, imapSecure, body.imapUsername.trim(), body.imapPassword, folder]
    );

    const { rows } = await pgPool.query(
      `select id, firm_id, provider, imap_host, imap_port, imap_secure, imap_username, folder, status, updated_at from mailbox_connections where id = $1`,
      [id]
    );
    const row = rows[0];
    res.status(201).json({
      ok: true,
      mailbox: {
        id: row.id,
        firmId: row.firm_id,
        provider: row.provider,
        imapHost: row.imap_host,
        imapPort: row.imap_port,
        imapSecure: row.imap_secure,
        imapUsername: row.imap_username,
        folder: row.folder,
        status: row.status,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/mailboxes", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const { rows } = await pgPool.query(
      `
      select
        id,
        firm_id,
        provider,
        imap_username,
        imap_host,
        folder,
        status,
        last_uid,
        last_sync_at,
        last_error,
        updated_at
      from mailbox_connections
      where firm_id = $1
      order by updated_at desc
      limit 50
      `,
      [firmId]
    );
    res.json({ ok: true, items: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/metrics/cost/leaderboard", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const scopeGlobal = String(req.query.scope ?? "").trim().toLowerCase() === "global" && isInternalCacheControlRequest(req);
    const groupBy = parseCostLeaderboardGroupBy(req.query.groupBy);
    const bucket = parseCostBucket(req.query.bucket);
    const limit = parseMetricsLimit(req.query.limit, 10, 50);
    const { from, to, days } = parseMetricsRange(req.query.range);
    const scopedFirmId = scopeGlobal ? null : firmId;

    const [leaderboard, summary, timeseries] = await Promise.all([
      getAiCostLeaderboard({
        groupBy,
        from,
        to,
        firmId: scopedFirmId,
        limit,
      }),
      getAiCostSummary({
        from,
        to,
        firmId: scopedFirmId,
      }),
      groupBy === "task"
        ? getAiCostTimeseries({
            bucket,
            from,
            to,
            firmId: scopedFirmId,
          })
        : Promise.resolve([]),
    ]);

    res.json({
      ok: true,
      scope: scopeGlobal ? "global" : "firm",
      filters: {
        groupBy,
        bucket,
        range: `${days}d`,
        limit,
      },
      summary: summary.totals,
      leaderboard,
      topCostDrivers: leaderboard.slice(0, 3),
      timeseries,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/metrics/cost/document/:id", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const document = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, originalName: true, routedCaseId: true },
    });

    if (!document) {
      return res.status(404).json({ ok: false, error: "Document not found" });
    }

    const summary = await getDocumentAiCostSummary(documentId);
    res.json({
      ok: true,
      documentId,
      document: {
        id: document.id,
        originalName: document.originalName,
        routedCaseId: document.routedCaseId,
      },
      summary: summary.totals,
      byTask: summary.byTask,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/metrics/cost/firm/:id", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const authFirmId = (req as any).firmId as string;
    const requestedFirmId = String(req.params.id ?? "");
    const isInternal = isInternalCacheControlRequest(req);
    if (requestedFirmId !== authFirmId && !isInternal) {
      return res.status(403).json({ ok: false, error: "firmId mismatch" });
    }

    const { from, to, days } = parseMetricsRange(req.query.range);
    const bucket = parseCostBucket(req.query.bucket);
    const [summary, daily, leaderboard] = await Promise.all([
      getFirmAiCostSummary(requestedFirmId, { from, to }),
      getAiCostTimeseries({ bucket, from, to, firmId: requestedFirmId }),
      getAiCostLeaderboard({ groupBy: "task", from, to, firmId: requestedFirmId, limit: 10 }),
    ]);

    res.json({
      ok: true,
      firmId: requestedFirmId,
      filters: {
        bucket,
        range: `${days}d`,
      },
      summary: summary.totals,
      byTask: summary.byTask,
      daily,
      topCostDrivers: leaderboard.slice(0, 3),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/metrics/ops/overview", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    if (!isInternalCacheControlRequest(req)) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    const firmId = (req as any).firmId as string;
    const scopeGlobal = String(req.query.scope ?? "").trim().toLowerCase() === "global";
    const scopedFirmId = scopeGlobal ? null : firmId;
    const { from, to, days } = parseMetricsRange(req.query.range);

    const [queue, deferredJobs, cacheHitRates, costSummary, costDaily] = await Promise.all([
      getRedisQueueSnapshot(),
      getDeferredJobTelemetryOverview({ from, to, firmId: scopedFirmId }),
      getAiCacheHitRates({ from, to, firmId: scopedFirmId }),
      getAiCostSummary({ from, to, firmId: scopedFirmId }),
      getAiCostTimeseries({ bucket: "day", from, to, firmId: scopedFirmId }),
    ]);

    res.json({
      ok: true,
      scope: scopeGlobal ? "global" : "firm",
      filters: {
        range: `${days}d`,
      },
      queue,
      deferredJobs,
      cache: {
        hitRates: cacheHitRates,
      },
      aiCost: {
        summary: costSummary.totals,
        daily: costDaily,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/metrics/ops/weekly-report", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    if (!isInternalCacheControlRequest(req)) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    const firmId = (req as any).firmId as string;
    const scope = String(req.query.scope ?? "global").trim().toLowerCase() === "firm" ? "firm" : "global";
    const { days } = parseMetricsRange(req.query.range);
    const report = await buildWeeklyOperatorReport({
      scope,
      firmId,
      days,
    });

    res.json({
      ok: true,
      report,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.use(errorLogMiddleware);

export function startServer(listenPort: number = port) {
  validateProductionRuntime();
  return app.listen(listenPort, () => {
    console.log(`API listening on :${listenPort}`);
    console.log("[server] version", buildVersionPayload("api"));
    // Keep the normal local stack self-contained: API dev also drains doc_jobs unless explicitly disabled.
    if (process.env.NODE_ENV !== "production" && process.env.ENABLE_INLINE_DOCUMENT_WORKER !== "false") {
      startDocumentWorkerLoop({ label: "inline-worker" }).catch((e) => {
        console.error("[inline-worker] fatal error", e);
      });
    }
  });
}

if (require.main === module) {
  startServer();
}
