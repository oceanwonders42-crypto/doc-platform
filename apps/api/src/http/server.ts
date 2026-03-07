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
import path from "path";
import bcrypt from "bcryptjs";
import multer from "multer";

import { prisma } from "../db/prisma";
import { auth } from "./middleware/auth";
import { authWithScope } from "./middleware/authScope";
import { sessionMiddleware } from "./middleware/session";
import { requireRole } from "./middleware/requireRole";
import { requireAdminOrFirmAdminForFirm } from "./middleware/requireAdminOrFirmAdmin";
import { requireAdminOrFirmAdminForProvider } from "./middleware/requireAdminOrFirmAdminForProvider";
import {
  requireProviderSession,
  createProviderSession,
  clearProviderSession,
} from "./middleware/providerSession";
import { requireExportFirm } from "./middleware/requireExportFirm";
import { rateLimitEndpoint, rateLimitByIp } from "./middleware/rateLimitEndpoint";
import { securityHeaders } from "./middleware/securityHeaders";
import { validateIdParam } from "./middleware/requestGuards";
import { getSystemHealth } from "../services/systemHealth";
import {
  triggerDatabaseBackup,
  listBackups,
  getBackupById,
  restoreFromBackup,
} from "../services/backupManager";
import { emitSystemAlert } from "../services/systemAlerts";
import { getAbuseStats } from "../services/abuseTracking";
import { validateUploadFile } from "../services/fileSecurityScan";
import { logIntakeFailure } from "../services/intakeLogger";
import { normalizeFilename, buildOriginalMetadata } from "../services/ingestHelpers";
import { sendSafeError } from "../lib/errors";
import { signToken } from "../lib/jwt";
import { requestLog, logWarn } from "../lib/logger";
import { requestIdAndLog } from "./middleware/requestIdAndLog";
import { sendError } from "./middleware/sendError";
import { errorLogMiddleware } from "./middleware/errorLogMiddleware";
import { putObject } from "../services/storage";
import {
  enqueueDocumentJob,
  enqueueOcrJob,
  enqueueExtractionJob,
  enqueueTimelineRebuildJob,
  getRedisQueueLength,
  getMigrationQueueLength,
} from "../services/queue";
import { matchDocumentToCase } from "../services/caseMatching";
import {
  scoreDocumentRouting,
  getExtractedForRouting,
  type RoutingScoreResult,
} from "../services/routingScorer";
import { recordRoutingFeedback } from "../services/routingFeedback";
import { findDuplicateCandidates } from "../services/duplicateDetection";
import { resolveProvider } from "../services/providerNormalization";
import { rebuildCaseTimeline } from "../services/caseTimeline";
import { getCaseInsights } from "../services/caseInsights";
import {
  createNotification,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notifications";
import { buildCaseReportPdf } from "../services/caseReportPdf";
import {
  buildTimelineChronologyPdf,
  buildTimelineChronologyDocx,
} from "../services/timelineChronologyExport";
import { fetchCourtDocket } from "../court/docketFetcher";
import { testImapConnection } from "../email/imapPoller";
import { routeDocument } from "../services/documentRouting";
import { correctRouting, correctProvider, setExportOverrides, AUDIT_ACTIONS } from "../services/adminCorrections";
import { addDocumentAuditEvent } from "../services/audit";
import { recordReviewQueueEnter, recordReviewQueueExit } from "../services/reviewQueueEvent";
import { generateNarrative } from "../ai/narrativeAssistant";
import { explainDocument } from "../ai/documentExplain";
import { generateRecordsRequestLetter } from "../ai/recordsLetterGenerator";
import { pushCaseIntelligenceToCrm, pushCrmWebhook } from "../integrations/crm/pushService";
import { buildRecordsRequestLetterPdf } from "../services/recordsLetterPdf";
import { buildOffersSummaryPdf } from "../services/offersSummaryPdf";
import { buildProviderPacketPdf } from "../services/providerPacketPdf";
import { generateCaseSummary } from "../services/caseSummaryService";
import { buildCasePacketZip } from "../services/casePacketExport";
import { logActivity } from "../services/activityFeed";
import { sendAdapter } from "../send/compositeAdapter";
import { pushDocumentToClio } from "../integrations/clioAdapter";
import { getPresignedGetUrl } from "../services/storage";
import { countPagesFromBuffer } from "../services/pageCount";
import { hasFeature, hasPremiumWorkflow } from "../services/featureFlags";
import { getWorkflowConfig, setWorkflowConfig } from "../services/premiumWorkflowConfig";
import { bulkRouteDocuments, bulkUnrouteDocuments } from "../services/bulkDocumentActions";
import { recordPremiumEvent } from "../services/premiumAnalytics";
import { canIngestDocument, getDocLimitForFirm, getOverageForPeriod, getUsageForPeriod, getPlanMetadata, listPlansForDisplay } from "../services/billingPlans";
import { enqueueJob } from "../services/jobRunner";
import { WEBHOOK_EVENTS } from "../services/webhooks";
import casesRouter from "./routes/cases";
import integrationsRouter from "./routes/integrations";
import recordsRequestsRouter from "./routes/recordsRequests";
import { Prisma, Role } from "@prisma/client";
import { IntegrationType, IntegrationProvider, IntegrationStatus } from "@prisma/client";
import { encryptSecret } from "../services/credentialEncryption";
import { generateClioContactsCsv, generateClioMattersCsv } from "../exports/clioExport";
import { importClioMappingsFromCsv } from "../services/clioMappingsImport";
import { fetchCasesFromCRM, upsertCrmCaseMapping } from "../integrations/crm/crmAdapter";
import { getClioAccessToken } from "../services/clioConfig";
import { logSystemError, getFailureCategory, FAILURE_CATEGORIES } from "../services/errorLog";
import { recordAbuse } from "../services/abuseTracking";
import {
  enqueueJob as enqueueJobToQueue,
  listJobs,
  getJobWithEvents,
  retryJob,
  cancelJob,
  getJobCounts,
} from "../services/jobQueue";
import { getFirmExportNamingRules, setFirmExportNamingRules, getRecognitionForDocument, buildDocumentNamingContext, applyFilePattern, applyFolderPattern, getFolderForDocType } from "../services/export/namingRules";
import { getPaperlessSettings, updatePaperlessSettings } from "../services/paperlessSettings";
import { ingestMigrationDocument } from "../services/migrationIngest";
import {
  getChecklistWithState,
  updatePaperlessTransitionState,
  type PaperlessTransitionStepId,
} from "../services/paperlessTransitionWorkflow";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(sessionMiddleware);
app.use(securityHeaders);
app.use(requestIdAndLog);
app.use(express.json({ limit: "25mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "api" }));

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

// --- Auth (session + login) ---
app.post("/auth/login", async (req, res) => {
  try {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password required", code: "VALIDATION_ERROR" });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firmId: true, email: true, role: true, passwordHash: true },
    });
    if (!user) {
      recordAbuse({
        ip: (req as any).ip || req.socket?.remoteAddress || "unknown",
        route: "/auth/login",
        eventType: "auth_failure",
      });
      return res.status(401).json({ ok: false, error: "Invalid email or password", code: "UNAUTHORIZED" });
    }
    if (!user.passwordHash) {
      return res.status(403).json({
        ok: false,
        error: "Password login not set for this user. Use an API key or contact admin.",
        code: "PASSWORD_NOT_SET",
      });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordAbuse({
        ip: (req as any).ip || req.socket?.remoteAddress || "unknown",
        route: "/auth/login",
        eventType: "auth_failure",
      });
      return res.status(401).json({ ok: false, error: "Invalid email or password", code: "UNAUTHORIZED" });
    }
    const session = (req as any).session;
    if (session) {
      session.userId = user.id;
      session.firmId = user.firmId;
      session.email = user.email;
      session.role = user.role;
    }
    const token = signToken({
      userId: user.id,
      firmId: user.firmId,
      role: user.role,
      email: user.email,
    });
    res.json({
      ok: true,
      token,
      user: { id: user.id, email: user.email, firmId: user.firmId, role: user.role },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/auth/logout", (req, res) => {
  const session = (req as any).session;
  if (session && typeof session.destroy === "function") {
    session.destroy((err: Error) => {
      if (err) res.status(500).json({ ok: false, error: "Logout failed" });
      else res.json({ ok: true });
    });
  } else {
    res.json({ ok: true });
  }
});

app.get("/auth/me", auth, (req, res) => {
  const firmId = (req as any).firmId as string;
  const userId = (req as any).userId as string | null;
  const authRole = (req as any).authRole;
  if (!firmId) {
    return res.status(401).json({ ok: false, error: "Not authenticated", code: "UNAUTHORIZED" });
  }
  Promise.all([
    prisma.firm.findUnique({
      where: { id: firmId },
      select: { id: true, name: true, plan: true, status: true },
    }),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, role: true },
        })
      : Promise.resolve(null),
  ])
    .then(([firm, user]) => {
      if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });
      res.json({
        ok: true,
        firm: { id: firm.id, name: firm.name, plan: firm.plan, status: firm.status },
        user: user ? { id: user.id, email: user.email, role: user.role } : null,
        role: authRole,
      });
    })
    .catch((e: any) => res.status(500).json({ ok: false, error: String(e?.message || e) }));
});

app.patch("/auth/set-password", auth, requireRole(Role.STAFF), async (req, res) => {
  const userId = (req as any).userId as string | null;
  const firmId = (req as any).firmId as string;
  if (!userId) {
    return res.status(400).json({ ok: false, error: "Session or user-scoped API key required to set password", code: "BAD_REQUEST" });
  }
  const body = (req.body ?? {}) as { password?: string };
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: "Password must be at least 8 characters", code: "VALIDATION_ERROR" });
  }
  const user = await prisma.user.findFirst({ where: { id: userId, firmId }, select: { id: true } });
  if (!user) return res.status(404).json({ ok: false, error: "User not found" });
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  res.json({ ok: true });
});

// Support: submit bug report (firm-scoped; STAFF+; rate limited)
app.post(
  "/support/bug-report",
  auth,
  requireRole(Role.STAFF),
  rateLimitByIp(10, "support-bug-report"),
  async (req, res, next) => {
    try {
      const firmId = (req as any).firmId as string | undefined;
      const userId = (req as any).userId as string | undefined;
      if (!firmId) {
        return sendSafeError(res, 403, "Firm context required", "FORBIDDEN");
      }
      const body = req.body || {};
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim() || null : null;
      const screenshotUrl = typeof body.screenshotUrl === "string" ? body.screenshotUrl.trim() || null : null;
      if (!title || title.length > 500) {
        recordAbuse({ ip: (req as any).ip || req.socket?.remoteAddress || "unknown", route: "/support/bug-report", eventType: "invalid_payload" });
        return sendSafeError(res, 400, "Title is required (max 500 chars)", "VALIDATION_ERROR");
      }
      if (!description || description.length > 10000) {
        recordAbuse({ ip: (req as any).ip || req.socket?.remoteAddress || "unknown", route: "/support/bug-report", eventType: "invalid_payload" });
        return sendSafeError(res, 400, "Description is required (max 10000 chars)", "VALIDATION_ERROR");
      }
      const report = await prisma.appBugReport.create({
        data: {
          firmId,
          userId: userId || null,
          title,
          description,
          pageUrl,
          screenshotUrl,
          status: "OPEN",
          priority: (body.priority === "HIGH" || body.priority === "URGENT" || body.priority === "LOW") ? body.priority : "MEDIUM",
        },
      });
      res.status(201).json({ ok: true, id: report.id });
    } catch (e) {
      next(e);
    }
  }
);

app.use("/cases", casesRouter);
app.use("/integrations", integrationsRouter);
app.use("/records-requests", recordsRequestsRouter);

// Admin: list firms with stats (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/firms", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res) => {
  try {
    const [firms, docCounts, userCounts, usageAgg] = await Promise.all([
      prisma.firm.findMany({
        select: { id: true, name: true, status: true, plan: true, pageLimitMonthly: true, createdAt: true },
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
      firmId: f.id,
      firmName: f.name,
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

// Admin: providers list (JSON for platform admin) or HTML page (firm admin / staff)
app.get("/admin/providers", auth, async (req, res) => {
  if (req.accepts("html")) {
    requireRole(Role.STAFF)(req, res, () => {
      const p = path.join(__dirname, "..", "..", "public", "admin", "providers.html");
      res.sendFile(p, (err) => {
        if (err) res.status(404).json({ ok: false, error: "Admin providers page not found" });
      });
    });
    return;
  }
  requireRole(Role.PLATFORM_ADMIN)(req, res, async () => {
    try {
      const firmIdRaw = Array.isArray(req.query.firmId) ? req.query.firmId[0] : req.query.firmId;
      const firmId = typeof firmIdRaw === "string" && firmIdRaw.trim() ? firmIdRaw.trim() : null;

      const where = firmId ? { firmId } : {};
      const providers = await prisma.provider.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          firmId: true,
          name: true,
          address: true,
          city: true,
          state: true,
          phone: true,
          email: true,
          specialty: true,
          verified: true,
          subscriptionTier: true,
          listingActive: true,
          expiresAt: true,
          lat: true,
          lng: true,
          createdAt: true,
        },
      });
      res.json({ ok: true, items: providers });
    } catch (e) {
      console.error("[admin/providers]", e);
      res.status(500).json({ ok: false, error: "Failed to load providers" });
    }
  });
});

// Admin: provider management page (map, aliases, corrections)
app.get("/admin/provider-management", auth, requireRole(Role.STAFF), (req, res) => {
  const p = path.join(__dirname, "..", "..", "public", "admin", "provider-management.html");
  res.sendFile(p, (err) => {
    if (err) res.status(404).json({ ok: false, error: "Provider management page not found" });
  });
});

// Admin: cases list page (HTML) for staff
app.get("/admin/cases", auth, requireRole(Role.STAFF), (req, res) => {
  const p = path.join(__dirname, "..", "..", "public", "admin", "cases-list.html");
  res.sendFile(p, (err) => {
    if (err) res.status(404).json({ ok: false, error: "Cases list page not found" });
  });
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
    const body = (req.body ?? {}) as { plan?: string; pageLimitMonthly?: number; status?: string; documentLimitMonthly?: number | null };

    const data: { plan?: string; pageLimitMonthly?: number; status?: string; settings?: object } = {};
    if (typeof body.plan === "string" && body.plan.trim()) data.plan = body.plan.trim();
    if (typeof body.pageLimitMonthly === "number" && body.pageLimitMonthly >= 0) data.pageLimitMonthly = body.pageLimitMonthly;
    if (typeof body.status === "string" && body.status.trim()) data.status = body.status.trim();
    if (body.documentLimitMonthly !== undefined) {
      const current = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } });
      const settings = (current?.settings as Record<string, unknown>) ?? {};
      if (body.documentLimitMonthly === null || body.documentLimitMonthly === undefined) {
        delete settings.documentLimitMonthly;
      } else {
        settings.documentLimitMonthly = Math.max(0, Math.floor(body.documentLimitMonthly));
      }
      data.settings = settings as object;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, error: "No valid fields to update" });
    }

    const firm = await prisma.firm.update({
      where: { id: firmId },
      data,
      select: { id: true, name: true, plan: true, pageLimitMonthly: true, status: true, settings: true },
    });
    res.json({ ok: true, firm });
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ ok: false, error: "Firm not found" });
    console.error("[admin/firms/:firmId PATCH]", e);
    res.status(500).json({ ok: false, error: "Failed to update firm" });
  }
});

// Admin: firm billing visibility (usage, overage, plan)
app.get("/admin/firms/:firmId/billing", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const firmId = String(req.params.firmId ?? "");
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { id: true, name: true, plan: true, pageLimitMonthly: true, billingStatus: true, trialEndsAt: true, billingCustomerId: true },
    });
    if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

    const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    const documentLimitMonthly = await getDocLimitForFirm(firmId);
    const usage = await getUsageForPeriod(firmId, ym);
    const overage = await getOverageForPeriod(firmId, ym);
    const planMeta = getPlanMetadata(firm.plan);

    res.json({
      ok: true,
      firm: {
        id: firm.id,
        name: firm.name,
        plan: firm.plan,
        pageLimitMonthly: firm.pageLimitMonthly,
        documentLimitMonthly,
        billingStatus: firm.billingStatus,
        trialEndsAt: firm.trialEndsAt?.toISOString() ?? null,
        billingCustomerId: firm.billingCustomerId ?? null,
        planMetadata: planMeta ? { name: planMeta.name, docLimitMonthly: planMeta.docLimitMonthly, priceMonthlyDollars: planMeta.priceMonthlyDollars, overagePerDocDollars: planMeta.overagePerDocDollars, priceOneTimeDollars: planMeta.priceOneTimeDollars } : null,
      },
      usage: usage ?? { yearMonth: ym, docsProcessed: 0, pagesProcessed: 0, insuranceDocsExtracted: 0, courtDocsExtracted: 0, narrativeGenerated: 0, duplicateDetected: 0 },
      overage: overage ?? null,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /firms — create firm (PLATFORM_ADMIN_API_KEY)
app.post("/firms", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { name, plan } = (req.body ?? {}) as { name?: string; plan?: string };
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    const firm = await prisma.firm.create({
      data: {
        name: name.trim(),
        plan: typeof plan === "string" && plan.trim() ? plan.trim() : "starter",
      },
      select: { id: true, name: true, plan: true },
    });
    res.json({ ok: true, firm });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /firms/:id/users — create user (PLATFORM_ADMIN or FIRM_ADMIN for this firm)
app.post("/firms/:id/users", auth, requireAdminOrFirmAdminForFirm, async (req, res) => {
  try {
    const firmId = String(req.params.id ?? "");
    const { email, role, password } = (req.body ?? {}) as { email?: string; role?: string; password?: string };
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ ok: false, error: "email is required" });
    }
    const roleEnum = role === "STAFF" ? "STAFF" : "FIRM_ADMIN";
    const data: { firmId: string; email: string; role: "STAFF" | "FIRM_ADMIN"; passwordHash?: string } = {
      firmId,
      email: email.trim().toLowerCase(),
      role: roleEnum as "STAFF" | "FIRM_ADMIN",
    };
    if (typeof password === "string" && password.length >= 8) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }
    const user = await prisma.user.create({
      data,
      select: { id: true, email: true, role: true, firmId: true },
    });
    res.json({ ok: true, user });
  } catch (e: any) {
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
    const rawKey = "sk_live_" + crypto.randomBytes(24).toString("hex");
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        firmId,
        name: typeof name === "string" && name.trim() ? name.trim() : "API Key",
        keyPrefix: rawKey.slice(0, 12),
        keyHash,
        scopes: "ingest",
      },
      select: { id: true, keyPrefix: true, firmId: true },
    });

    res.json({
      ok: true,
      apiKey: rawKey,
      keyPrefix: apiKey.keyPrefix,
      id: apiKey.id,
      message: "Save this key now. It will not be shown again.",
    });
  } catch (e: any) {
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

// Firm-level CRM config (no secrets). For UI/ops: show Clio vs webhook and if configured.
app.get("/crm/config", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    });
    const settings = (firm?.settings ?? {}) as Record<string, unknown>;
    const provider = settings.crm === "clio" ? "clio" : settings.crmWebhookUrl || settings.crm_webhook_url ? "generic_webhook" : null;
    const clioResult = provider === "clio" ? await getClioAccessToken(firmId) : { configured: false as const };
    const clioConfigured = clioResult.configured === true;
    const webhookConfigured = !!(settings.crmWebhookUrl || settings.crm_webhook_url || process.env.FIRM_CRM_WEBHOOK_URL);
    res.json({
      ok: true,
      provider: provider ?? null,
      clioConfigured,
      webhookConfigured,
    });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

// Clio: connect (store OAuth token), disconnect, list matters for mapping
app.post("/crm/clio/connect", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { accessToken?: string };
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (!accessToken) {
      return res.status(400).json({ ok: false, error: "accessToken is required" });
    }
    let encrypted: string;
    try {
      encrypted = encryptSecret(JSON.stringify({ accessToken }));
    } catch {
      return res.status(500).json({ ok: false, error: "Encryption not configured (ENCRYPTION_KEY)" });
    }
    const integration = await prisma.firmIntegration.create({
      data: {
        firmId,
        type: IntegrationType.CASE_API,
        provider: IntegrationProvider.CLIO,
        status: "CONNECTED",
      },
    });
    await prisma.integrationCredential.create({
      data: { integrationId: integration.id, encryptedSecret: encrypted },
    });
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    });
    const settings = (firm?.settings ?? {}) as Record<string, unknown>;
    await prisma.firm.update({
      where: { id: firmId },
      data: {
        settings: {
          ...settings,
          crm: "clio",
          crmIntegrationId: integration.id,
        } as object,
      },
    });
    res.json({ ok: true, integrationId: integration.id, message: "Clio connected" });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

app.post("/crm/clio/disconnect", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    });
    const settings = (firm?.settings ?? {}) as Record<string, unknown>;
    const integrationId = settings.crmIntegrationId as string | undefined;
    if (integrationId) {
      await prisma.firmIntegration.updateMany({
        where: { id: integrationId, firmId },
        data: { status: IntegrationStatus.DISCONNECTED },
      });
    }
    const { crmIntegrationId: _removed, ...rest } = settings;
    await prisma.firm.update({
      where: { id: firmId },
      data: { settings: { ...rest, crm: null } as object },
    });
    res.json({ ok: true, message: "Clio disconnected" });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

app.get("/crm/clio/matters", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const result = await fetchCasesFromCRM(firmId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, cases: [] });
    }
    res.json({ ok: true, cases: result.cases });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e), cases: [] });
  }
});

// CRM push log (sync history) for support/ops
app.get("/crm/push-log", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 200);
    const caseIdRaw = typeof req.query.caseId === "string" ? req.query.caseId.trim() : null;
    const items = await prisma.crmPushLog.findMany({
      where: { firmId, ...(caseIdRaw ? { caseId: caseIdRaw } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({
      ok: true,
      items: items.map((l) => ({
        id: l.id,
        caseId: l.caseId,
        documentId: l.documentId,
        actionType: l.actionType,
        provider: l.provider,
        ok: l.ok,
        externalId: l.externalId,
        error: l.error,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e), items: [] });
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

app.post("/crm/clio/mappings", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { caseId?: string; externalMatterId?: string };
    const caseId = typeof body.caseId === "string" ? body.caseId.trim() : "";
    const externalMatterId = typeof body.externalMatterId === "string" ? body.externalMatterId.trim() : "";
    if (!caseId || !externalMatterId) {
      return res.status(400).json({ ok: false, error: "caseId and externalMatterId are required" });
    }
    const c = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });
    await upsertCrmCaseMapping(firmId, caseId, externalMatterId);
    res.json({ ok: true, caseId, externalMatterId });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
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
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.webhookEndpoint.delete({ where: { id, firmId } });
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

// Admin: queue status (Redis document pipeline + DB jobs) for operational visibility
app.get("/admin/queue-status", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res, next) => {
  try {
    const [redisPending, dbCounts] = await Promise.all([
      getRedisQueueLength(),
      getJobCounts(null),
    ]);
    res.json({
      ok: true,
      redis: {
        pending: redisPending,
        description: "Document pipeline (OCR → classification → extraction → case match → timeline)",
      },
      db: {
        queued: dbCounts.queued,
        running: dbCounts.running,
        failed: dbCounts.failed,
        retryBacklog: dbCounts.retryBacklog,
        description: "DB-backed jobs (demand_package, records_request, export, timeline.rebuild, etc.)",
      },
    });
  } catch (e) {
    next(e);
  }
});

// Admin: jobs list and retry (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/jobs", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    if (req.accepts("html")) {
      const p = path.join(__dirname, "..", "..", "public", "admin", "jobs.html");
      return res.sendFile(p);
    }
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const statusFilter = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : undefined;
    const typeFilter = typeof req.query.type === "string" && req.query.type.trim() ? req.query.type.trim() : undefined;
    const firmIdFilter = typeof req.query.firmId === "string" && req.query.firmId.trim() ? req.query.firmId.trim() : undefined;
    const onlyFailed = req.query.onlyFailed === "true" || req.query.onlyFailed === "1";
    const cursor = typeof req.query.cursor === "string" && req.query.cursor.trim() ? req.query.cursor.trim() : undefined;
    const { items, nextCursor } = await listJobs({
      status: statusFilter,
      type: typeFilter,
      firmId: firmIdFilter,
      onlyFailed,
      limit,
      cursor,
    });
    const enriched = items.map((j: { payload?: Record<string, unknown>; [k: string]: unknown }) => ({
      ...j,
      documentId: j.payload && typeof j.payload === "object" && "documentId" in j.payload ? (j.payload as { documentId?: string }).documentId : undefined,
      caseId: j.payload && typeof j.payload === "object" && "caseId" in j.payload ? (j.payload as { caseId?: string }).caseId : undefined,
    }));
    res.json({ ok: true, items: enriched, nextCursor });
  } catch (e) {
    next(e);
  }
});

app.post("/admin/jobs/:id/retry", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    const result = await retryJob(id);
    if (!result.ok) return res.status(result.error === "Job not found" ? 404 : 400).json({ ok: false, error: result.error });
    res.json({ ok: true, message: "Job queued for retry" });
  } catch (e) {
    next(e);
  }
});

app.post("/admin/jobs/:id/cancel", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    const result = await cancelJob(id);
    if (!result.ok) return res.status(result.error === "Job not found" ? 404 : 400).json({ ok: false, error: result.error });
    res.json({ ok: true, message: "Job cancelled" });
  } catch (e) {
    next(e);
  }
});

// POST /jobs — create job (STAFF: firmId from auth)
app.post("/jobs", auth, requireRole(Role.STAFF), async (req, res, next) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { type: string; payload?: Record<string, unknown>; priority?: number; runAt?: string; maxAttempts?: number };
    const type = body.type?.trim();
    if (!type) return res.status(400).json({ ok: false, error: "type required" });
    const payload = body.payload != null ? body.payload : {};
    const runAt = body.runAt ? new Date(body.runAt) : new Date();
    const job = await enqueueJobToQueue({
      firmId,
      type,
      payload,
      priority: body.priority,
      runAt,
      maxAttempts: body.maxAttempts,
    });
    res.status(201).json({ ok: true, jobId: job.id, status: "queued" });
  } catch (e) {
    next(e);
  }
});

// GET /jobs — list jobs (STAFF: own firm; PLATFORM_ADMIN: all or ?firmId=)
app.get("/jobs", auth, requireRole(Role.STAFF), async (req, res, next) => {
  try {
    const authRole = (req as any).authRole as Role | undefined;
    const firmIdAuth = (req as any).firmId as string | undefined;
    const firmIdFilter = typeof req.query.firmId === "string" && req.query.firmId.trim() ? req.query.firmId.trim() : null;
    const firmId = authRole === Role.PLATFORM_ADMIN && firmIdFilter ? firmIdFilter : firmIdAuth;
    const status = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : undefined;
    const type = typeof req.query.type === "string" && req.query.type.trim() ? req.query.type.trim() : undefined;
    const onlyFailed = req.query.onlyFailed === "true" || req.query.onlyFailed === "1";
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 200);
    const cursor = typeof req.query.cursor === "string" && req.query.cursor.trim() ? req.query.cursor.trim() : undefined;
    const { items, nextCursor } = await listJobs({
      ...(firmId ? { firmId } : {}),
      status: status || undefined,
      type,
      onlyFailed,
      limit,
      cursor,
    });
    const enriched = items.map((j: { payload?: Record<string, unknown>; [k: string]: unknown }) => ({
      ...j,
      documentId: j.payload && typeof j.payload === "object" && "documentId" in j.payload ? (j.payload as { documentId?: string }).documentId : undefined,
      caseId: j.payload && typeof j.payload === "object" && "caseId" in j.payload ? (j.payload as { caseId?: string }).caseId : undefined,
    }));
    res.json({ ok: true, items: enriched, nextCursor });
  } catch (e) {
    next(e);
  }
});

// GET /jobs/counts — dashboard counts
app.get("/jobs/counts", auth, requireRole(Role.STAFF), async (req, res, next) => {
  try {
    const authRole = (req as any).authRole as Role | undefined;
    const firmIdAuth = (req as any).firmId as string | undefined;
    const firmIdFilter = typeof req.query.firmId === "string" && req.query.firmId.trim() ? req.query.firmId.trim() : null;
    const firmId = authRole === Role.PLATFORM_ADMIN && firmIdFilter ? firmIdFilter : firmIdAuth ?? undefined;
    const counts = await getJobCounts(firmId);
    res.json({ ok: true, ...counts });
  } catch (e) {
    next(e);
  }
});

// GET /me/queue-status — simple queue visibility for STAFF (firm DB jobs + document pipeline pending)
app.get("/me/queue-status", auth, requireRole(Role.STAFF), async (req, res, next) => {
  try {
    const firmId = (req as any).firmId as string;
    const [dbCounts, redisPending] = await Promise.all([
      getJobCounts(firmId),
      getRedisQueueLength(),
    ]);
    res.json({
      ok: true,
      db: { queued: dbCounts.queued, running: dbCounts.running, failed: dbCounts.failed },
      documentPipelinePending: redisPending,
    });
  } catch (e) {
    next(e);
  }
});

// GET /jobs/:id — job detail + events
app.get("/jobs/:id", auth, requireRole(Role.STAFF), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    const authRole = (req as any).authRole as Role | undefined;
    const firmIdAuth = (req as any).firmId as string | undefined;
    const job = await getJobWithEvents(id);
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    if (authRole !== Role.PLATFORM_ADMIN && job.firmId !== firmIdAuth) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }
    const payload = job.payload as Record<string, unknown> | null | undefined;
    const out = { ...job, documentId: payload?.documentId, caseId: payload?.caseId };
    res.json({ ok: true, job: out });
  } catch (e) {
    next(e);
  }
});

// Admin: job detail page (HTML) or JSON
app.get("/admin/jobs/:id", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    if (req.accepts("html")) {
      const p = path.join(__dirname, "..", "..", "public", "admin", "job-detail.html");
      return res.sendFile(p);
    }
    const job = await getJobWithEvents(id);
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    const payload = job.payload as Record<string, unknown> | null | undefined;
    const out = { ...job, documentId: payload?.documentId, caseId: payload?.caseId };
    res.json({ ok: true, job: out });
  } catch (e) {
    next(e);
  }
});

// POST /jobs/:id/retry
app.post("/jobs/:id/retry", auth, requireRole(Role.STAFF), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    const authRole = (req as any).authRole as Role | undefined;
    const firmIdAuth = (req as any).firmId as string | undefined;
    const job = await prisma.job.findUnique({ where: { id }, select: { firmId: true } });
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    if (authRole !== Role.PLATFORM_ADMIN && job.firmId !== firmIdAuth) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }
    const result = await retryJob(id);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, message: "Job queued for retry" });
  } catch (e) {
    next(e);
  }
});

// POST /jobs/:id/cancel
app.post("/jobs/:id/cancel", auth, requireRole(Role.STAFF), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    const authRole = (req as any).authRole as Role | undefined;
    const firmIdAuth = (req as any).firmId as string | undefined;
    const job = await prisma.job.findUnique({ where: { id }, select: { firmId: true } });
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    if (authRole !== Role.PLATFORM_ADMIN && job.firmId !== firmIdAuth) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }
    const result = await cancelJob(id);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, message: "Job cancelled" });
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
    const severityFilter = typeof req.query.severity === "string" && ["INFO", "WARN", "ERROR", "CRITICAL"].includes(req.query.severity)
      ? req.query.severity
      : null;
    const areaFilter = typeof req.query.area === "string" && req.query.area.trim()
      ? req.query.area.trim()
      : null;
    const statusFilter = typeof req.query.status === "string" && ["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(req.query.status)
      ? req.query.status
      : null;
    const where: Record<string, unknown> = {};
    if (serviceFilter) where.service = serviceFilter;
    if (severityFilter) where.severity = severityFilter;
    if (areaFilter) where.area = areaFilter;
    if (statusFilter) where.status = statusFilter;
    const logs = await prisma.systemErrorLog.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ ok: true, errors: logs });
  } catch (e) {
    next(e);
  }
});

// Admin: get one system error
app.get(
  "/admin/errors/:id",
  auth,
  requireRole(Role.PLATFORM_ADMIN),
  validateIdParam("id"),
  async (req, res, next) => {
    try {
      const log = await prisma.systemErrorLog.findUnique({
        where: { id: req.params.id },
      });
      if (!log) {
        return sendSafeError(res, 404, "Error log not found", "NOT_FOUND");
      }
      res.json({ ok: true, error: log });
    } catch (e) {
      next(e);
    }
  }
);

// Admin: update system error (e.g. mark resolved)
app.patch(
  "/admin/errors/:id",
  auth,
  requireRole(Role.PLATFORM_ADMIN),
  validateIdParam("id"),
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const status = typeof body.status === "string" && ["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(body.status)
        ? body.status
        : undefined;
      const resolvedAt = status === "RESOLVED" ? new Date() : undefined;
      const log = await prisma.systemErrorLog.update({
        where: { id: req.params.id },
        data: { ...(status && { status }), ...(resolvedAt !== undefined && { resolvedAt }) },
      });
      res.json({ ok: true, error: log });
    } catch (e: any) {
      if (e?.code === "P2025") {
        return sendSafeError(res, 404, "Error log not found", "NOT_FOUND");
      }
      next(e);
    }
  }
);

// Admin: system health (API, DB, redis, recent errors, failed jobs, abuse/support signals, backup status)
app.get("/admin/system/health", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res, next) => {
  try {
    const health = await getSystemHealth();
    res.json({ ok: true, health });
  } catch (e) {
    next(e);
  }
});

// Admin: manually trigger backup
app.post("/admin/system/backup", auth, requireRole(Role.PLATFORM_ADMIN), async (_req, res, next) => {
  try {
    const result = await triggerDatabaseBackup();
    if (result.status === "FAILED") {
      return res.status(500).json({ ok: false, error: "Backup failed" });
    }
    res.status(201).json({ ok: true, backup: result });
  } catch (e) {
    next(e);
  }
});

// Admin: list backups (filter by date/type)
app.get("/admin/system/backups", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const backupType = typeof req.query.backupType === "string" && ["DB", "FILE_STORAGE", "CONFIG"].includes(req.query.backupType) ? req.query.backupType as "DB" | "FILE_STORAGE" | "CONFIG" : undefined;
    const status = typeof req.query.status === "string" && ["SUCCESS", "FAILED"].includes(req.query.status) ? req.query.status as "SUCCESS" | "FAILED" : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const take = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const list = await listBackups({ backupType, status, since: from, until: to, limit: take });
    res.json({ ok: true, backups: list, total: list.length });
  } catch (e) {
    next(e);
  }
});

// Admin: restore from backup (confirmation required; logs incident)
app.post(
  "/admin/system/restore/:id",
  auth,
  requireRole(Role.PLATFORM_ADMIN),
  validateIdParam("id"),
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const confirm = typeof body.confirm === "string" ? body.confirm : "";
      if (confirm !== "RESTORE") {
        return sendSafeError(res, 400, "Confirmation required: send { confirm: 'RESTORE' } in body", "VALIDATION_ERROR");
      }
      const backupId = req.params.id;
      const userId = (req as any).userId as string | undefined;
      await emitSystemAlert("restore_attempted", { backupId, userId, confirmed: true }).catch(() => {});
      const incident = await prisma.systemIncident.create({
        data: {
          severity: "CRITICAL",
          title: "Database restore executed",
          description: `Restore from backup ${backupId} was triggered.`,
          status: "MITIGATING",
          relatedErrorId: null,
        },
      });
      const restoreResult = await restoreFromBackup(backupId);
      if (!restoreResult.ok) {
        await prisma.systemIncident.update({
          where: { id: incident.id },
          data: { description: `${incident.description} Failed: ${restoreResult.error}`, status: "RESOLVED", resolvedAt: new Date() },
        });
        return sendSafeError(res, 500, restoreResult.error ?? "Restore failed", "INTERNAL_ERROR");
      }
      await prisma.systemIncident.update({
        where: { id: incident.id },
        data: { description: `${incident.description} Completed successfully.`, status: "RESOLVED", resolvedAt: new Date() },
      });
      res.json({ ok: true, message: "Restore completed", incidentId: incident.id });
    } catch (e) {
      next(e);
    }
  }
);

// Admin: incidents — create
app.post("/admin/incidents", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const body = req.body || {};
    const severity = typeof body.severity === "string" && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.severity) ? body.severity : "MEDIUM";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const relatedErrorId = typeof body.relatedErrorId === "string" ? body.relatedErrorId.trim() || null : null;
    if (!title) {
      return sendSafeError(res, 400, "Title is required", "VALIDATION_ERROR");
    }
    const incident = await prisma.systemIncident.create({
      data: { severity, title, description, status: "OPEN", relatedErrorId },
    });
    res.status(201).json({ ok: true, incident });
  } catch (e) {
    next(e);
  }
});

// Admin: incidents — list
app.get("/admin/incidents", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const statusFilter = typeof req.query.status === "string" && ["OPEN", "MITIGATING", "RESOLVED"].includes(req.query.status) ? req.query.status : null;
    const severityFilter = typeof req.query.severity === "string" && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(req.query.severity) ? req.query.severity : null;
    const incidents = await prisma.systemIncident.findMany({
      where: {
        ...(statusFilter && { status: statusFilter }),
        ...(severityFilter && { severity: severityFilter }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ ok: true, incidents });
  } catch (e) {
    next(e);
  }
});

// Admin: incidents — update
app.patch(
  "/admin/incidents/:id",
  auth,
  requireRole(Role.PLATFORM_ADMIN),
  validateIdParam("id"),
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const status = typeof body.status === "string" && ["OPEN", "MITIGATING", "RESOLVED"].includes(body.status) ? body.status : undefined;
      const severity = typeof body.severity === "string" && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.severity) ? body.severity : undefined;
      const title = typeof body.title === "string" ? body.title.trim() : undefined;
      const description = typeof body.description === "string" ? body.description.trim() ?? undefined : undefined;
      const resolvedAt = status === "RESOLVED" ? new Date() : undefined;
      const incident = await prisma.systemIncident.update({
        where: { id: req.params.id },
        data: { ...(status && { status }), ...(severity && { severity }), ...(title && { title }), ...(description !== undefined && { description }), ...(resolvedAt !== undefined && { resolvedAt }) },
      });
      res.json({ ok: true, incident });
    } catch (e: any) {
      if (e?.code === "P2025") return sendSafeError(res, 404, "Incident not found", "NOT_FOUND");
      next(e);
    }
  }
);

// Admin: security/abuse activity (platform admin)
app.get("/admin/security/activity", auth, requireRole(Role.PLATFORM_ADMIN), (_req, res) => {
  const stats = getAbuseStats();
  res.json({ ok: true, abuse: stats });
});

// Admin: list bug reports (platform admin; optional firmId filter)
app.get("/admin/support/bug-reports", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const firmIdFilter = typeof req.query.firmId === "string" && req.query.firmId.trim() ? req.query.firmId.trim() : null;
    const statusFilter = typeof req.query.status === "string" && ["OPEN", "IN_PROGRESS", "CLOSED"].includes(req.query.status) ? req.query.status : null;
    const priorityFilter = typeof req.query.priority === "string" && ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(req.query.priority) ? req.query.priority : null;
    const reports = await prisma.appBugReport.findMany({
      where: {
        ...(firmIdFilter && { firmId: firmIdFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(priorityFilter && { priority: priorityFilter }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ ok: true, reports });
  } catch (e) {
    next(e);
  }
});

// Admin: quality page (HTML); funnel and analytics are separate JSON endpoints
app.get("/admin/quality", auth, requireRole(Role.PLATFORM_ADMIN), (req, res) => {
  const p = path.join(__dirname, "..", "..", "public", "admin", "quality.html");
  res.sendFile(p, (err) => {
    if (err) res.status(404).json({ ok: false, error: "Quality page not found" });
  });
});

// Settings: routing learning page (firm-scoped; STAFF can view)
app.get("/settings/routing-learning", auth, requireRole(Role.STAFF), (_req, res) => {
  const p = path.join(__dirname, "..", "..", "public", "admin", "routing-learning.html");
  res.sendFile(p, (err) => {
    if (err) res.status(404).json({ ok: false, error: "Routing learning page not found" });
  });
});

// Admin: OCR and extraction quality metrics (low-confidence, handwriting, multilingual, etc.)
app.get("/admin/quality/ocr-extraction-metrics", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const firmIdFilter = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const dateFrom = typeof q.dateFrom === "string" && q.dateFrom.trim() ? new Date(q.dateFrom.trim()) : null;
    const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim() ? new Date(q.dateTo.trim()) : null;
    const dateTo = dateToRaw && !isNaN(dateToRaw.getTime()) ? (() => { const d = new Date(dateToRaw); d.setUTCHours(23, 59, 59, 999); return d; })() : null;

    let whereClause = ' FROM document_recognition dr INNER JOIN "Document" d ON d.id = dr.document_id WHERE 1=1';
    const params: (string | Date)[] = [];
    let idx = 1;
    if (firmIdFilter) {
      whereClause += ` AND d."firmId" = $${idx}`;
      params.push(firmIdFilter);
      idx++;
    }
    if (dateFrom && !isNaN(dateFrom.getTime())) {
      whereClause += ` AND d."ingestedAt" >= $${idx}`;
      params.push(dateFrom);
      idx++;
    }
    if (dateTo && !isNaN(dateTo.getTime())) {
      whereClause += ` AND d."ingestedAt" <= $${idx}`;
      params.push(dateTo);
      idx++;
    }

    const { rows } = await pgPool.query<{
      total_with_recognition: string;
      low_ocr_confidence_count: string;
      handwriting_doc_count: string;
      multilingual_count: string;
      strict_mode_count: string;
    }>(
      `SELECT
        count(*)::text AS total_with_recognition,
        count(*) FILTER (WHERE dr.ocr_confidence IS NOT NULL AND dr.ocr_confidence < 0.7)::text AS low_ocr_confidence_count,
        count(*) FILTER (WHERE dr.has_handwriting = true)::text AS handwriting_doc_count,
        count(*) FILTER (WHERE dr.detected_language IS NOT NULL AND dr.detected_language != 'en')::text AS multilingual_count,
        count(*) FILTER (WHERE dr.extraction_strict_mode = true)::text AS strict_mode_count
       ${whereClause}`,
      params
    );
    const r = rows[0];
    res.json({
      ok: true,
      metrics: {
        totalWithRecognition: parseInt(r?.total_with_recognition ?? "0", 10),
        lowOcrConfidenceCount: parseInt(r?.low_ocr_confidence_count ?? "0", 10),
        handwritingDocCount: parseInt(r?.handwriting_doc_count ?? "0", 10),
        multilingualCount: parseInt(r?.multilingual_count ?? "0", 10),
        strictModeCount: parseInt(r?.strict_mode_count ?? "0", 10),
      },
      filter: { firmId: firmIdFilter ?? null, dateFrom: dateFrom?.toISOString() ?? null, dateTo: dateTo?.toISOString() ?? null },
    });
  } catch (e: any) {
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

// Admin: processing funnel — stage counts, failures, avg time (optional firmId, dateFrom, dateTo)
app.get("/admin/quality/funnel", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const firmIdFilter = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const dateFrom = typeof q.dateFrom === "string" && q.dateFrom.trim() ? new Date(q.dateFrom.trim()) : null;
    const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim() ? new Date(q.dateTo.trim()) : null;
    const dateTo =
      dateToRaw && !isNaN(dateToRaw.getTime())
        ? (() => {
            const d = new Date(dateToRaw);
            d.setUTCHours(23, 59, 59, 999);
            return d;
          })()
        : null;

    const ingestedFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom && !isNaN(dateFrom.getTime())) ingestedFilter.gte = dateFrom;
    if (dateTo && !isNaN(dateTo.getTime())) ingestedFilter.lte = dateTo;
    const hasDateFilter = Object.keys(ingestedFilter).length > 0;

    const whereBase = {
      ...(firmIdFilter ? { firmId: firmIdFilter } : {}),
      ...(hasDateFilter ? { ingestedAt: ingestedFilter } : {}),
    };

    const stages = ["uploaded", "ocr", "classification", "extraction", "case_match", "complete"] as const;

    const [byStage, failedCount, avgTimeResult] = await Promise.all([
      prisma.document.groupBy({
        by: ["processingStage"],
        where: whereBase,
        _count: { id: true },
      }),
      prisma.document.count({
        where: { ...whereBase, status: "FAILED" },
      }),
      (() => {
        const params: (string | Date)[] = [];
        let sql = `SELECT
          AVG(EXTRACT(EPOCH FROM ("processedAt" - "ingestedAt")) * 1000)::float AS avg_ms,
          COUNT(*)::int AS completed_count
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
        return pgPool.query<{ avg_ms: number | null; completed_count: string }>(sql, params);
      })(),
    ]);

    const stageCounts: Record<string, number> = {};
    for (const s of stages) stageCounts[s] = 0;
    for (const row of byStage) {
      const stage = String(row.processingStage ?? "uploaded");
      if (stages.includes(stage as any)) stageCounts[stage] = row._count.id;
    }

    const avgRow = (avgTimeResult as { rows: Array<{ avg_ms: number | null; completed_count: string }> }).rows?.[0];
    const avgProcessingTimeMs = avgRow?.avg_ms != null ? Math.round(avgRow.avg_ms) : null;
    const completedCount = avgRow?.completed_count != null ? parseInt(avgRow.completed_count, 10) || 0 : 0;

    const totalInFunnel = stages.reduce((sum, s) => sum + (stageCounts[s] ?? 0), 0);

    res.json({
      ok: true,
      stages: stageCounts,
      uploaded: stageCounts.uploaded ?? 0,
      ocr: stageCounts.ocr ?? 0,
      classification: stageCounts.classification ?? 0,
      extraction: stageCounts.extraction ?? 0,
      case_match: stageCounts.case_match ?? 0,
      complete: stageCounts.complete ?? 0,
      failedCount,
      completedCount,
      totalInFunnel: totalInFunnel + failedCount,
      avgProcessingTimeMs,
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
      firmId: firmIdFilter,
    });
  } catch (e: any) {
    console.error("GET /admin/quality/funnel failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: recognition quality — docs by doc type, avg quality, issues, low-confidence, extraction correction rate, settlement offers count
app.get("/admin/quality/recognition", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "recognition-quality.html");
    return res.sendFile(p, (err: Error | null) => {
      if (err) res.status(404).json({ ok: false, error: "Recognition quality page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const [byTypeRows, qualityRows, issuesRows, lowConfRows, extractionFeedback, offersCount] = await Promise.all([
      pgPool.query<{ doc_type: string; count: string }>(
        `select coalesce(dr.doc_type, 'unknown') as doc_type, count(*)::text as count
         from document_recognition dr
         inner join "Document" d on d.id = dr.document_id
         where d."firmId" = $1
         group by dr.doc_type order by count desc`,
        [firmId]
      ),
      pgPool.query<{ avg_quality: string | null }>(
        `select avg((dr.quality_score)::double precision)::text as avg_quality
         from document_recognition dr
         inner join "Document" d on d.id = dr.document_id
         where d."firmId" = $1 and dr.quality_score is not null`,
        [firmId]
      ),
      pgPool.query<{ issue_key: string; cnt: string }>(
        `select j.key as issue_key, count(*)::text as cnt
         from document_recognition dr
         inner join "Document" d on d.id = dr.document_id,
         lateral jsonb_each_text(dr.issues_json) j
         where d."firmId" = $1 and dr.issues_json is not null and jsonb_typeof(dr.issues_json) = 'object'
         group by j.key order by cnt desc limit 20`,
        [firmId]
      ).catch(() => ({ rows: [] })),
      pgPool.query<{ document_id: string; doc_type: string | null; confidence: string }>(
        `select dr.document_id, dr.doc_type, dr.confidence::text
         from document_recognition dr
         inner join "Document" d on d.id = dr.document_id
         where d."firmId" = $1 and dr.confidence is not null and (dr.confidence::double precision) < 0.6
         order by dr.confidence asc limit 50`,
        [firmId]
      ),
      prisma.extractionFeedback.groupBy({
        by: ["fieldKey"],
        where: { firmId },
        _count: { id: true },
      }).then(async (groups) => {
        const correctionRate: { fieldKey: string; total: number; correctCount: number }[] = [];
        for (const g of groups) {
          const correctCount = await prisma.extractionFeedback.count({
            where: { firmId, fieldKey: g.fieldKey, wasCorrect: true },
          });
          correctionRate.push({ fieldKey: g.fieldKey, total: g._count.id, correctCount });
        }
        return correctionRate;
      }).catch(() => []),
      pgPool.query<{ cnt: string }>(
        `select count(*)::text as cnt from "Document" d
         join document_recognition dr on dr.document_id = d.id
         where d."firmId" = $1 and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null and (dr.insurance_fields->>'settlementOffer')::float > 0`,
        [firmId]
      ),
    ]);

    const byType = (byTypeRows as { rows: { doc_type: string; count: string }[] }).rows.map((r) => ({
      docType: r.doc_type,
      count: parseInt(r.count, 10) || 0,
    }));
    const avgQuality = qualityRows.rows[0]?.avg_quality != null ? parseFloat(qualityRows.rows[0].avg_quality) : null;
    const topIssues = (issuesRows as { rows: { issue_key: string; cnt: string }[] }).rows.map((r) => ({
      issue: r.issue_key,
      count: parseInt(r.cnt, 10) || 0,
    }));
    const lowConfidence = (lowConfRows as { rows: { document_id: string; doc_type: string | null; confidence: string }[] }).rows.map((r) => ({
      documentId: r.document_id,
      docType: r.doc_type,
      confidence: parseFloat(r.confidence) || 0,
    }));
    const extractionCorrectionByField = Array.isArray(extractionFeedback) ? extractionFeedback.map((x: { fieldKey: string; total: number; correctCount: number }) => ({
      fieldKey: x.fieldKey,
      total: x.total,
      correctCount: x.correctCount,
      correctionRatePct: x.total > 0 ? Math.round((1 - x.correctCount / x.total) * 1000) / 10 : null,
    })) : [];
    const settlementOffersCount = parseInt((offersCount as { rows: { cnt: string }[] }).rows[0]?.cnt ?? "0", 10);

    res.json({
      ok: true,
      byDocType: byType,
      avgQualityScore: avgQuality != null ? Math.round(avgQuality * 1000) / 1000 : null,
      topQualityIssues: topIssues,
      lowConfidenceClassifications: lowConfidence,
      extractionCorrectionByField: extractionCorrectionByField,
      settlementOffersDetectedCount: settlementOffersCount,
    });
  } catch (e: any) {
    console.error("GET /admin/quality/recognition failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: classification stats — documents by detected type, confidence averages, override counts/%
app.get("/admin/quality/classification-stats", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const firmIdFilter = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const dateFrom = typeof q.dateFrom === "string" && q.dateFrom.trim() ? new Date(q.dateFrom.trim()) : null;
    const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim() ? new Date(q.dateTo.trim()) : null;
    const dateTo =
      dateToRaw && !isNaN(dateToRaw.getTime())
        ? (() => {
            const d = new Date(dateToRaw);
            d.setUTCHours(23, 59, 59, 999);
            return d;
          })()
        : null;

    const params: (string | Date)[] = [];
    let whereClause = ' FROM document_recognition dr INNER JOIN "Document" d ON d.id = dr.document_id WHERE 1=1';
    if (firmIdFilter) {
      params.push(firmIdFilter);
      whereClause += ` AND d."firmId" = $${params.length}`;
    }
    if (dateFrom && !isNaN(dateFrom.getTime())) {
      params.push(dateFrom);
      whereClause += ` AND d."ingestedAt" >= $${params.length}`;
    }
    if (dateTo && !isNaN(dateTo.getTime())) {
      params.push(dateTo);
      whereClause += ` AND d."ingestedAt" <= $${params.length}`;
    }

    const sql = `
      SELECT
        COALESCE(dr.doc_type, 'unknown') AS doc_type,
        COUNT(*)::int AS count,
        AVG(CAST(dr.confidence AS double precision))::float AS avg_confidence,
        SUM(CASE WHEN (d."extractedFields"->>'docType') IS NOT NULL AND (d."extractedFields"->>'docType') IS DISTINCT FROM dr.doc_type THEN 1 ELSE 0 END)::int AS override_count
      ${whereClause}
      GROUP BY dr.doc_type
      ORDER BY count DESC
    `;
    const { rows } = await pgPool.query<{
      doc_type: string;
      count: number;
      avg_confidence: number | null;
      override_count: number;
    }>(sql, params);

    const byType = rows.map((r) => {
      const count = Number(r.count) || 0;
      const overrideCount = Number(r.override_count) || 0;
      const overridePct = count > 0 ? Math.round((overrideCount / count) * 1000) / 10 : 0;
      return {
        docType: r.doc_type,
        count,
        avgConfidence: r.avg_confidence != null ? Math.round(r.avg_confidence * 1000) / 1000 : null,
        overrideCount,
        overridePct,
      };
    });

    const totalWithRecognition = byType.reduce((sum, r) => sum + r.count, 0);
    const totalOverrides = byType.reduce((sum, r) => sum + r.overrideCount, 0);
    const overridePctOverall = totalWithRecognition > 0 ? Math.round((totalOverrides / totalWithRecognition) * 1000) / 10 : 0;

    res.json({
      ok: true,
      byType,
      totalWithRecognition,
      totalOverrides,
      overridePctOverall,
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
      firmId: firmIdFilter ?? null,
    });
  } catch (e: any) {
    console.error("GET /admin/quality/classification-stats failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: failure categories — normalize SystemErrorLog.message into categories, return counts + examples
app.get("/admin/quality/failure-categories", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const limit = Math.min(Math.max(parseInt(String(q.limit), 10) || 2000, 1), 10000);
    const dateFrom = typeof q.dateFrom === "string" && q.dateFrom.trim() ? new Date(q.dateFrom.trim()) : null;
    const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim() ? new Date(q.dateTo.trim()) : null;
    const dateTo =
      dateToRaw && !isNaN(dateToRaw.getTime())
        ? (() => {
            const d = new Date(dateToRaw);
            d.setUTCHours(23, 59, 59, 999);
            return d;
          })()
        : null;
    const maxExamples = Math.min(Math.max(parseInt(String(q.maxExamples), 10) || 5, 1), 20);

    const where: { createdAt?: { gte?: Date; lte?: Date } } = {};
    if (dateFrom && !isNaN(dateFrom.getTime())) where.createdAt = { ...where.createdAt, gte: dateFrom };
    if (dateTo && !isNaN(dateTo.getTime())) where.createdAt = { ...where.createdAt, lte: dateTo };

    const logs = await prisma.systemErrorLog.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, message: true, service: true, createdAt: true },
    });

    const categories: Record<string, { count: number; examples: string[] }> = {};
    for (const cat of FAILURE_CATEGORIES) {
      categories[cat] = { count: 0, examples: [] };
    }

    const seenExamples = new Map<string, Set<string>>();
    for (const cat of FAILURE_CATEGORIES) {
      seenExamples.set(cat, new Set());
    }

    for (const log of logs) {
      const message = log.message ?? "";
      const category = getFailureCategory(message, log.service);
      categories[category].count += 1;
      const set = seenExamples.get(category)!;
      const snippet = message.length > 300 ? message.slice(0, 300) + "…" : message;
      if (set.size < maxExamples && snippet.trim()) {
        set.add(snippet);
      }
    }

    const result: Record<string, { count: number; examples: string[] }> = {};
    for (const cat of FAILURE_CATEGORIES) {
      result[cat] = {
        count: categories[cat].count,
        examples: Array.from(seenExamples.get(cat)!),
      };
    }

    const totalCount = logs.length;

    res.json({
      ok: true,
      categories: result,
      totalCount,
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
    });
  } catch (e: any) {
    console.error("GET /admin/quality/failure-categories failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: health score per firm (failed rate, unmatched rate, auto-route rate, avg latency, recent errors, review backlog)
app.get("/admin/quality/health-score", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const firmIdFilter = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const dateFrom = typeof q.dateFrom === "string" && q.dateFrom.trim() ? new Date(q.dateFrom.trim()) : null;
    const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim() ? new Date(q.dateTo.trim()) : null;
    const dateTo =
      dateToRaw && !isNaN(dateToRaw.getTime())
        ? (() => {
            const d = new Date(dateToRaw);
            d.setUTCHours(23, 59, 59, 999);
            return d;
          })()
        : null;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const errorsSince = dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : sevenDaysAgo;

    const [perFirmRows, firms, recentErrorsCount] = await Promise.all([
      (() => {
        const params: (string | Date)[] = [];
        let sql = `SELECT
          d."firmId" AS firm_id,
          COUNT(*)::text AS total_docs,
          COUNT(*) FILTER (WHERE d.status IN ('UPLOADED','NEEDS_REVIEW','UNMATCHED'))::text AS processed_docs,
          COUNT(*) FILTER (WHERE d.status = 'UPLOADED')::text AS auto_routed,
          COUNT(*) FILTER (WHERE d.status = 'UNMATCHED')::text AS unmatched,
          COUNT(*) FILTER (WHERE d.status = 'FAILED')::text AS failed_docs,
          COUNT(*) FILTER (WHERE d.status = 'NEEDS_REVIEW')::text AS needs_review_docs,
          AVG(EXTRACT(EPOCH FROM (d."processedAt" - d."ingestedAt")) * 1000) FILTER (WHERE d."processedAt" IS NOT NULL AND d."ingestedAt" IS NOT NULL) AS avg_ms
          FROM "Document" d
          WHERE 1=1`;
        if (firmIdFilter) {
          params.push(firmIdFilter);
          sql += ` AND d."firmId" = $${params.length}`;
        }
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
      prisma.firm.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        ...(firmIdFilter ? { where: { id: firmIdFilter } } : {}),
      }),
      prisma.systemErrorLog.count({
        where: { createdAt: { gte: errorsSince } },
      }),
    ]);

    const firmByName = new Map(firms.map((f) => [f.id, f.name]));

    type Row = {
      firm_id: string;
      total_docs: string;
      processed_docs: string;
      auto_routed: string;
      unmatched: string;
      failed_docs: string;
      needs_review_docs: string;
      avg_ms: number | null;
    };

    const rows = (perFirmRows as { rows: Row[] }).rows ?? [];

    function computeScore(r: Row, recentErrors: number): number {
      const total = Math.max(1, parseInt(r.total_docs, 10) || 0);
      const processed = Math.max(1, parseInt(r.processed_docs, 10) || 0);
      const failed = parseInt(r.failed_docs, 10) || 0;
      const unmatched = parseInt(r.unmatched, 10) || 0;
      const autoRouted = parseInt(r.auto_routed, 10) || 0;
      const needsReview = parseInt(r.needs_review_docs, 10) || 0;
      const avgMs = r.avg_ms != null ? r.avg_ms : null;

      const failedRate = failed / total;
      const unmatchedRate = unmatched / processed;
      const autoRouteRate = autoRouted / processed;
      const failedRateScore = 1 - Math.min(1, failedRate);
      const unmatchedRateScore = 1 - Math.min(1, unmatchedRate);
      const autoRouteRateScore = Math.min(1, autoRouteRate);
      const latencyScore = avgMs == null ? 1 : Math.max(0, 1 - avgMs / 120000); // 2 min = 0
      const systemErrorsScore = Math.max(0, 1 - recentErrors / 30); // 30+ = 0
      const reviewBacklogScore = Math.max(0, 1 - needsReview / 100); // 100+ = 0

      const raw = (failedRateScore + unmatchedRateScore + autoRouteRateScore + latencyScore + systemErrorsScore + reviewBacklogScore) / 6;
      return Math.round(raw * 100);
    }

    const items = rows.map((r) => {
      const total = Math.max(1, parseInt(r.total_docs, 10) || 0);
      const processed = Math.max(1, parseInt(r.processed_docs, 10) || 0);
      const failed = parseInt(r.failed_docs, 10) || 0;
      const unmatched = parseInt(r.unmatched, 10) || 0;
      const autoRouted = parseInt(r.auto_routed, 10) || 0;
      const needsReview = parseInt(r.needs_review_docs, 10) || 0;
      const score = computeScore(r, recentErrorsCount);
      return {
        firmId: r.firm_id,
        firmName: firmByName.get(r.firm_id) ?? r.firm_id,
        score: Math.min(100, Math.max(0, score)),
        failedRate: total > 0 ? Math.round((failed / total) * 10000) / 100 : 0,
        unmatchedRate: processed > 0 ? Math.round((unmatched / processed) * 10000) / 100 : 0,
        autoRouteRate: processed > 0 ? Math.round((autoRouted / processed) * 10000) / 100 : 0,
        avgLatencyMs: r.avg_ms != null ? Math.round(r.avg_ms) : null,
        recentSystemErrors: recentErrorsCount,
        reviewBacklog: needsReview,
        totalDocs: total,
        processedDocs: parseInt(r.processed_docs, 10) || 0,
        failedDocs: failed,
      };
    });

    if (firmIdFilter && items.length === 1) {
      return res.json({
        ok: true,
        firm: items[0],
        recentSystemErrors: recentErrorsCount,
        dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
        dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
      });
    }

    const overallScore = items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.score, 0) / items.length)
      : null;

    res.json({
      ok: true,
      items,
      overallScore,
      recentSystemErrors: recentErrorsCount,
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
    });
  } catch (e: any) {
    console.error("GET /admin/quality/health-score failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: review SLA metrics (avg/median review time, open count, resolved today/week)
app.get("/admin/quality/review-sla", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const firmIdFilter = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const dateFrom = typeof q.dateFrom === "string" && q.dateFrom.trim() ? new Date(q.dateFrom.trim()) : null;
    const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim() ? new Date(q.dateTo.trim()) : null;
    const dateTo =
      dateToRaw && !isNaN(dateToRaw.getTime())
        ? (() => {
            const d = new Date(dateToRaw);
            d.setUTCHours(23, 59, 59, 999);
            return d;
          })()
        : null;

    const baseWhere = {
      ...(firmIdFilter ? { firmId: firmIdFilter } : {}),
    };
    const exitedAtRange: { gte?: Date; lte?: Date } = {};
    if (dateFrom && !isNaN(dateFrom.getTime())) exitedAtRange.gte = dateFrom;
    if (dateTo && !isNaN(dateTo.getTime())) exitedAtRange.lte = dateTo;
    const resolvedWhere = {
      ...baseWhere,
      exitedAt: { not: null, ...(Object.keys(exitedAtRange).length ? exitedAtRange : {}) },
    };
    const resolvedWhereToday = {
      ...baseWhere,
      exitedAt: {
        gte: new Date(new Date().setUTCHours(0, 0, 0, 0)),
      },
    };
    const resolvedWhereWeek = {
      ...baseWhere,
      exitedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    };

    const [openCount, resolvedToday, resolvedWeek, resolvedEvents] = await Promise.all([
      prisma.reviewQueueEvent.count({ where: { ...baseWhere, exitedAt: null } }),
      prisma.reviewQueueEvent.count({ where: resolvedWhereToday }),
      prisma.reviewQueueEvent.count({ where: resolvedWhereWeek }),
      prisma.reviewQueueEvent.findMany({
        where: resolvedWhere,
        select: { enteredAt: true, exitedAt: true },
      }),
    ]);

    const durationsMs = resolvedEvents
      .map((e) => (e.exitedAt ? e.exitedAt.getTime() - e.enteredAt.getTime() : 0))
      .filter((ms) => ms >= 0);
    const avgReviewTimeMs = durationsMs.length ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length : null;
    const sorted = [...durationsMs].sort((a, b) => a - b);
    const medianReviewTimeMs =
      sorted.length > 0 ? (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2 : null;

    res.json({
      ok: true,
      avgReviewTimeMs: avgReviewTimeMs != null ? Math.round(avgReviewTimeMs) : null,
      medianReviewTimeMs: medianReviewTimeMs != null ? Math.round(medianReviewTimeMs) : null,
      openReviewCount: openCount,
      resolvedToday,
      resolvedThisWeek: resolvedWeek,
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
    });
  } catch (e: any) {
    console.error("GET /admin/quality/review-sla failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: recent documents with low match confidence (below auto-route threshold or needs_review)
app.get("/admin/quality/low-confidence-routes", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const firmIdFilter = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const limit = Math.min(50, Math.max(1, parseInt(String(q.limit), 10) || 20));

    const params: (string | number)[] = [limit];
    let sql = `
      SELECT d.id AS document_id, d."firmId", d."originalName", d."routedCaseId", d.status, d."routingStatus", d."updatedAt",
             dr.match_confidence, dr.match_reason, dr.suggested_case_id,
             COALESCE(rr."minAutoRouteConfidence", 0.9) AS threshold
      FROM "Document" d
      INNER JOIN document_recognition dr ON dr.document_id = d.id
      LEFT JOIN "RoutingRule" rr ON rr."firmId" = d."firmId"
      WHERE dr.match_confidence IS NOT NULL
        AND (dr.match_confidence < COALESCE(rr."minAutoRouteConfidence", 0.9) OR d.status = 'NEEDS_REVIEW')
    `;
    if (firmIdFilter) {
      params.push(firmIdFilter);
      sql += ` AND d."firmId" = $${params.length}`;
    }
    sql += ` ORDER BY d."updatedAt" DESC LIMIT $1`;

    const { rows } = await pgPool.query(sql, params);
    const firmIds = [...new Set((rows as { firmId: string }[]).map((r) => r.firmId))];
    const firms = firmIds.length
      ? await prisma.firm.findMany({ where: { id: { in: firmIds } }, select: { id: true, name: true } })
      : [];
    const firmByName = new Map(firms.map((f) => [f.id, f.name]));

    const items = (rows as any[]).map((r) => ({
      documentId: r.document_id,
      firmId: r.firmId,
      firmName: firmByName.get(r.firmId) ?? r.firmId,
      originalName: r.originalName ?? r.document_id,
      matchConfidence: r.match_confidence != null ? Number(r.match_confidence) : null,
      threshold: r.threshold != null ? Number(r.threshold) : 0.9,
      matchReason: r.match_reason ?? null,
      suggestedCaseId: r.suggested_case_id ?? null,
      routedCaseId: r.routedCaseId ?? null,
      status: r.status,
      routingStatus: r.routingStatus ?? null,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
    }));

    res.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /admin/quality/low-confidence-routes failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin: weekly quality summary (JSON or CSV) — total docs, processed, rates, avg latency, top failures, worst firms, health score delta
app.get("/admin/quality/weekly-summary", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const format = String(q.format || "").toLowerCase() === "csv" ? "csv" : "json";
    let weekEnd: Date;
    let weekStart: Date;
    if (q.dateTo && q.dateFrom) {
      weekStart = new Date(String(q.dateFrom).trim());
      weekEnd = new Date(String(q.dateTo).trim());
      weekEnd.setUTCHours(23, 59, 59, 999);
    } else {
      weekEnd = new Date();
      weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setUTCHours(0, 0, 0, 0);
    }
    const prevWeekEnd = new Date(weekStart.getTime());
    prevWeekEnd.setUTCMilliseconds(prevWeekEnd.getUTCMilliseconds() - 1);
    const prevWeekStart = new Date(weekStart.getTime());
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    type DocRow = {
      firm_id: string;
      total_docs: string;
      processed_docs: string;
      auto_routed: string;
      unmatched: string;
      failed_docs: string;
      needs_review_docs: string;
      duplicate_count: string;
      avg_ms: number | null;
    };

    function runDocQuery(from: Date, to: Date): Promise<DocRow[]> {
      return pgPool
        .query(
          `SELECT d."firmId" AS firm_id,
          COUNT(*)::text AS total_docs,
          COUNT(*) FILTER (WHERE d.status IN ('UPLOADED','NEEDS_REVIEW','UNMATCHED'))::text AS processed_docs,
          COUNT(*) FILTER (WHERE d.status = 'UPLOADED')::text AS auto_routed,
          COUNT(*) FILTER (WHERE d.status = 'UNMATCHED')::text AS unmatched,
          COUNT(*) FILTER (WHERE d.status = 'FAILED')::text AS failed_docs,
          COUNT(*) FILTER (WHERE d.status = 'NEEDS_REVIEW')::text AS needs_review_docs,
          COUNT(*) FILTER (WHERE d."duplicateOfId" IS NOT NULL)::text AS duplicate_count,
          AVG(EXTRACT(EPOCH FROM (d."processedAt" - d."ingestedAt")) * 1000) FILTER (WHERE d."processedAt" IS NOT NULL AND d."ingestedAt" IS NOT NULL) AS avg_ms
          FROM "Document" d
          WHERE d."ingestedAt" >= $1 AND d."ingestedAt" <= $2
          GROUP BY d."firmId"`,
          [from, to]
        )
        .then((r: { rows: DocRow[] }) => r.rows ?? []);
    }

    const [thisWeekRows, prevWeekRows, firms, errorLogs, globalAvgMs] = await Promise.all([
      runDocQuery(weekStart, weekEnd),
      runDocQuery(prevWeekStart, prevWeekEnd),
      prisma.firm.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.systemErrorLog.findMany({
        where: { createdAt: { gte: weekStart, lte: weekEnd } },
        select: { message: true, service: true },
      }),
      pgPool
        .query<{ avg_ms: number | null }>(
          `SELECT AVG(EXTRACT(EPOCH FROM (d."processedAt" - d."ingestedAt")) * 1000) AS avg_ms
           FROM "Document" d
           WHERE d."ingestedAt" >= $1 AND d."ingestedAt" <= $2
             AND d."processedAt" IS NOT NULL AND d."ingestedAt" IS NOT NULL`,
          [weekStart, weekEnd]
        )
        .then((r: { rows: { avg_ms: number | null }[] }) => r.rows[0]?.avg_ms ?? null),
    ]);

    const firmByName = new Map(firms.map((f) => [f.id, f.name]));
    const recentErrorsCount = errorLogs.length;

    function computeScore(r: DocRow, recentErrors: number): number {
      const total = Math.max(1, parseInt(r.total_docs, 10) || 0);
      const processed = Math.max(1, parseInt(r.processed_docs, 10) || 0);
      const failed = parseInt(r.failed_docs, 10) || 0;
      const unmatched = parseInt(r.unmatched, 10) || 0;
      const autoRouted = parseInt(r.auto_routed, 10) || 0;
      const needsReview = parseInt(r.needs_review_docs, 10) || 0;
      const avgMs = r.avg_ms != null ? r.avg_ms : null;
      const failedRate = failed / total;
      const unmatchedRate = unmatched / processed;
      const autoRouteRate = autoRouted / processed;
      const failedRateScore = 1 - Math.min(1, failedRate);
      const unmatchedRateScore = 1 - Math.min(1, unmatchedRate);
      const autoRouteRateScore = Math.min(1, autoRouteRate);
      const latencyScore = avgMs == null ? 1 : Math.max(0, 1 - avgMs / 120000);
      const systemErrorsScore = Math.max(0, 1 - recentErrors / Math.max(1, thisWeekRows.length * 30));
      const reviewBacklogScore = Math.max(0, 1 - needsReview / 100);
      const raw = (failedRateScore + unmatchedRateScore + autoRouteRateScore + latencyScore + systemErrorsScore + reviewBacklogScore) / 6;
      return Math.round(raw * 100);
    }

    const categoryCounts: Record<string, number> = {};
    for (const cat of FAILURE_CATEGORIES) categoryCounts[cat] = 0;
    for (const log of errorLogs) {
      const cat = getFailureCategory(log.message ?? "", log.service ?? undefined);
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }
    const topFailures = (FAILURE_CATEGORIES as readonly string[])
      .map((cat) => ({ category: cat, count: categoryCounts[cat] ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const thisWeekFirmScores = thisWeekRows.map((r) => ({
      firmId: r.firm_id,
      firmName: firmByName.get(r.firm_id) ?? r.firm_id,
      score: Math.min(100, Math.max(0, computeScore(r, recentErrorsCount))),
    }));
    const prevWeekFirmScores = prevWeekRows.map((r) => ({
      firmId: r.firm_id,
      score: Math.min(100, Math.max(0, computeScore(r, 0))),
    }));
    const prevScoreByFirm = new Map(prevWeekFirmScores.map((p) => [p.firmId, p.score]));
    const overallScoreThisWeek =
      thisWeekFirmScores.length > 0
        ? Math.round(thisWeekFirmScores.reduce((s, i) => s + i.score, 0) / thisWeekFirmScores.length)
        : null;
    const overallScorePrevWeek =
      prevWeekFirmScores.length > 0
        ? Math.round(prevWeekFirmScores.reduce((s, i) => s + i.score, 0) / prevWeekFirmScores.length)
        : null;
    const healthScoreDelta =
      overallScoreThisWeek != null && overallScorePrevWeek != null ? overallScoreThisWeek - overallScorePrevWeek : null;

    const worstFirms = [...thisWeekFirmScores].sort((a, b) => a.score - b.score).slice(0, 10);

    const totalDocs = thisWeekRows.reduce((s, r) => s + (parseInt(r.total_docs, 10) || 0), 0);
    const processedDocs = thisWeekRows.reduce((s, r) => s + (parseInt(r.processed_docs, 10) || 0), 0);
    const autoRouted = thisWeekRows.reduce((s, r) => s + (parseInt(r.auto_routed, 10) || 0), 0);
    const unmatched = thisWeekRows.reduce((s, r) => s + (parseInt(r.unmatched, 10) || 0), 0);
    const duplicateCount = thisWeekRows.reduce((s, r) => s + (parseInt(r.duplicate_count, 10) || 0), 0);

    const avgLatencyMs = globalAvgMs != null ? Math.round(globalAvgMs) : null;

    const autoRouteRate = processedDocs > 0 ? Math.round((autoRouted / processedDocs) * 10000) / 100 : 0;
    const unmatchedRate = processedDocs > 0 ? Math.round((unmatched / processedDocs) * 10000) / 100 : 0;
    const duplicateRate = totalDocs > 0 ? Math.round((duplicateCount / totalDocs) * 10000) / 100 : 0;

    const jsonPayload = {
      ok: true,
      dateFrom: weekStart.toISOString().slice(0, 10),
      dateTo: weekEnd.toISOString().slice(0, 10),
      previousWeekFrom: prevWeekStart.toISOString().slice(0, 10),
      previousWeekTo: prevWeekEnd.toISOString().slice(0, 10),
      totalDocs,
      processedDocs,
      autoRouteRate,
      unmatchedRate,
      duplicateRate,
      avgLatencyMs,
      topFailures,
      worstFirms,
      overallScoreThisWeek,
      overallScorePrevWeek,
      healthScoreDelta,
    };

    if (format === "csv") {
      const rows: string[][] = [];
      const escapeCsv = (v: unknown): string => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      rows.push(["metric", "value"]);
      rows.push(["totalDocs", String(jsonPayload.totalDocs)]);
      rows.push(["processedDocs", String(jsonPayload.processedDocs)]);
      rows.push(["autoRouteRate%", String(jsonPayload.autoRouteRate)]);
      rows.push(["unmatchedRate%", String(jsonPayload.unmatchedRate)]);
      rows.push(["duplicateRate%", String(jsonPayload.duplicateRate)]);
      rows.push(["avgLatencyMs", String(jsonPayload.avgLatencyMs ?? "")]);
      rows.push(["overallScoreThisWeek", String(jsonPayload.overallScoreThisWeek ?? "")]);
      rows.push(["overallScorePrevWeek", String(jsonPayload.overallScorePrevWeek ?? "")]);
      rows.push(["healthScoreDelta", String(jsonPayload.healthScoreDelta ?? "")]);
      rows.push([]);
      rows.push(["Top failures", "category", "count"]);
      jsonPayload.topFailures.forEach((f) => rows.push(["", f.category, String(f.count)]));
      rows.push([]);
      rows.push(["Worst firms", "firmId", "firmName", "score"]);
      jsonPayload.worstFirms.forEach((f) => rows.push(["", f.firmId, f.firmName, String(f.score)]));
      const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="weekly-quality-summary-${weekStart.toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    res.json(jsonPayload);
  } catch (e: any) {
    console.error("GET /admin/quality/weekly-summary failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Daily cron: enqueue overdue task reminders job (run by job runner process). Call e.g. 0 9 * * * with platform admin auth.
app.post("/admin/cron/overdue-task-reminders", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const firm = await prisma.firm.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const firmId = firm?.id ?? "";
    if (!firmId) {
      return res.json({ ok: true, enqueued: false, message: "No firm" });
    }
    const jobId = await enqueueJob(firmId, "overdue_task_reminders");
    res.json({ ok: true, enqueued: true, jobId });
  } catch (e: any) {
    console.error("POST /admin/cron/overdue-task-reminders failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Nightly cron: enqueue retention cleanup job (run by job runner process). Call e.g. 0 2 * * * with platform admin auth.
app.post("/admin/cron/retention-cleanup", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const firm = await prisma.firm.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const firmId = firm?.id ?? "";
    if (!firmId) {
      return res.json({ ok: true, enqueued: false, message: "No firm" });
    }
    const jobId = await enqueueJob(firmId, "retention_cleanup");
    res.json({ ok: true, enqueued: true, jobId });
  } catch (e: any) {
    console.error("POST /admin/cron/retention-cleanup failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin demo seed: creates firm, cases, documents, timeline (dev only; in prod requires authApiKey)
// In non-production: bypasses auth, uses first firm or creates one (no DOC_API_KEY needed)
// Supports dryRun: true (returns created counts without writing)
app.post("/admin/demo/seed", async (req, res) => {
  const body = (req.body ?? {}) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;
  try {
    console.log("[DEMO SEED] running seed handler", { ts: new Date().toISOString(), dryRun });
    const isProd = process.env.NODE_ENV === "production";
    const demoMode = process.env.DEMO_MODE === "true";
    if (isProd && !demoMode) {
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
        firm = await prisma.firm.create({ data: { name: "Demo Firm" } });
        console.log("[DEMO SEED] created firm:", firm.id);
      }
      firmId = firm.id;
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

    // 1. MedicalEvent references Document
    try {
      const del = await pgPool.query('DELETE FROM "MedicalEvent" WHERE "firmId" = $1', [firmId]);
      if (del.rowCount && del.rowCount > 0) {
        console.log("[demo/seed] deleted MedicalEvent rows:", del.rowCount);
      }
    } catch (e) {
      console.warn("[demo/seed] MedicalEvent delete failed:", e);
    }
    // 2. CaseTimelineEvent references Case + Document
    await prisma.caseTimelineEvent.deleteMany({ where: { firmId } });
    await prisma.caseTimelineRebuild.deleteMany({ where: { firmId } });
    // 3. RecordsRequest references Case
    if (caseIds.length > 0) {
      await prisma.recordsRequest.deleteMany({ where: { caseId: { in: caseIds } } });
    }
    // 4. CrmPushLog references Case; CrmCaseMapping references Case
    await prisma.crmPushLog.deleteMany({ where: { firmId } });
    await prisma.crmCaseMapping.deleteMany({ where: { firmId } });
    // 5. DocumentAuditEvent references Document
    if (docIds.length > 0) {
      await prisma.documentAuditEvent.deleteMany({ where: { documentId: { in: docIds } } });
    }
    // 6. Document
    await prisma.document.deleteMany({ where: { firmId } });
    // 7. Case (raw SQL; Prisma schema may not match DB columns like clientId)
    await pgPool.query('DELETE FROM "Case" WHERE "firmId" = $1', [firmId]);

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

    await pgPool.query(
      `INSERT INTO "Case" (id, "firmId", title, "caseNumber", "clientName", "clientId", status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $5, 'active', $6), ($7, $2, $8, $9, $10, $10, 'active', $6), ($11, $2, $12, $13, $14, $14, 'active', $6)
       ON CONFLICT (id) DO NOTHING`,
      [caseId1, firmId, "Smith v. State Farm", "DEMO-001", "Alice Smith", now, caseId2, "Jones Medical Records", "DEMO-002", "Bob Jones", caseId3, "Wilson PI Claim", "DEMO-003", "Carol Wilson"]
    );
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
      { status: "UPLOADED", routedCaseId: caseId1, routedSystem: "manual", confidence: 0.95, caseNumber: "DEMO-001", clientName: "Alice Smith", hasOffer: false, hasMatch: false },
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
app.post("/dev/create-firm", async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const firm = await prisma.firm.create({ data: { name } });
  res.json(firm);
});

// TEMP dev route: create an API key for a firm (shows secret once)
// Dev-only: create API key for first/only firm (no auth, no firmId needed)
app.post("/admin/dev/create-api-key", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  let firm = await prisma.firm.findFirst({ orderBy: { createdAt: "asc" } });
  if (!firm) {
    firm = await prisma.firm.create({ data: { name: "Demo Firm" } });
  }
  const name = (req.body as { name?: string })?.name ?? "Dev API Key";
  const rawKey = "sk_live_" + crypto.randomBytes(24).toString("hex");
  const keyHash = await bcrypt.hash(rawKey, 10);

  await prisma.apiKey.create({
    data: {
      firmId: firm.id,
      name,
      keyPrefix: rawKey.slice(0, 12),
      keyHash,
    },
  });

  console.log("[admin/dev/create-api-key] apiKey:", rawKey);
  return res.json({ ok: true, apiKey: rawKey, firmId: firm.id });
});

app.post("/dev/create-api-key/:firmId", async (req, res) => {
  const { firmId } = req.params;
  const { name } = req.body ?? {};
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

  if (!file) return res.status(400).json({ ok: false, error: "Missing file (multipart field name must be 'file')" });

  const scan = await validateUploadFile({
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  });
  if (!scan.ok) {
    logIntakeFailure({
      stage: "validation",
      error: (scan as { reason?: string }).reason ?? "Invalid file",
      code: "INVALID_FILE",
      firmId,
      fileName: file.originalname,
      sizeBytes: file.size,
    });
    recordAbuse({ ip: (req as any).ip || req.socket?.remoteAddress || "unknown", route: "/ingest", eventType: "suspicious_upload" });
    return sendSafeError(res, 400, (scan as { reason?: string }).reason ?? "Invalid file", "INVALID_FILE");
  }
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
  });
  if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });
  const now = new Date();
  const isActive = firm.billingStatus === "active";
  const inTrial = firm.billingStatus === "trial" && (!firm.trialEndsAt || firm.trialEndsAt > now);
  if (!isActive && !inTrial) {
    return res.status(402).json({
      ok: false,
      error: "Billing required. Trial expired or inactive.",
      billingStatus: firm.billingStatus,
    });
  }

  const docLimitCheck = await canIngestDocument(firmId);
  if (!docLimitCheck.allowed) {
    return res.status(402).json({
      ok: false,
      error: docLimitCheck.error,
      docsProcessed: docLimitCheck.currentDocs,
      documentLimitMonthly: docLimitCheck.limit,
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
      await prisma.document.update({
        where: { id: existing.id },
        data: { duplicateMatchCount: { increment: 1 } },
      });

      const doc = await prisma.document.create({
        data: {
          firmId,
          source,
          spacesKey: existing.spacesKey,
          originalName: normalizeFilename(file.originalname),
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
          metaJson: buildOriginalMetadata({
            originalFilename: file.originalname,
            sizeBytes: file.size,
            mimeType: file.mimetype || "application/octet-stream",
          }),
        },
      });

      return res.json({
        ok: true,
        duplicate: true,
        documentId: doc.id,
        existingId: existing.id,
        spacesKey: existing.spacesKey,
      });
    }
  }

  const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
  const key = `${firmId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;

  await putObject(key, file.buffer, file.mimetype || "application/octet-stream");

  const originalMeta = buildOriginalMetadata({
    originalFilename: file.originalname,
    sizeBytes: file.size,
    mimeType: file.mimetype || "application/octet-stream",
  });
  const doc = await prisma.document.create({
    data: {
      firmId,
      source,
      spacesKey: key,
      originalName: originalMeta.normalizedFilename,
      mimeType: originalMeta.mimeType,
      pageCount: 0,
      status: "RECEIVED",
      external_id: externalId ?? null,
      file_sha256: fileSha256,
      fileSizeBytes,
      ingestedAt: new Date(),
      metaJson: originalMeta,
    },
  });
  try {
    await enqueueDocumentJob({ documentId: doc.id, firmId });
  } catch (e: unknown) {
    const errMsg = (e as Error)?.message ?? "Failed to enqueue processing";
    logIntakeFailure({
      stage: "enqueue",
      error: errMsg,
      code: "ENQUEUE_FAILED",
      firmId,
      fileName: file.originalname,
      sizeBytes: file.buffer?.length,
      documentId: doc.id,
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: "FAILED", failureStage: "ingest", failureReason: errMsg.slice(0, 2000) },
    });
    res.status(500).json({ ok: false, error: errMsg });
    return;
  }

  res.json({ ok: true, documentId: doc.id, spacesKey: key });
});

// Session-based ingest for dashboard (drag-and-drop, bulk upload). Same pipeline as POST /ingest.
app.post("/me/ingest", auth, requireRole(Role.STAFF), rateLimitEndpoint(60, "ingest"), upload.single("file"), async (req, res) => {
  const firmId = (req as any).firmId as string;
  const file = req.file;
  const source = (req.body?.source as string) || "upload";
  const externalId = req.body?.externalId ? String(req.body.externalId) : null;

  if (!file) return res.status(400).json({ ok: false, error: "Missing file (multipart field name must be 'file')" });

  const scan = await validateUploadFile({
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  });
  if (!scan.ok) {
    logIntakeFailure({
      stage: "validation",
      error: (scan as { reason?: string }).reason ?? "Invalid file",
      code: "INVALID_FILE",
      firmId,
      fileName: file.originalname,
      sizeBytes: file.size,
    });
    return sendSafeError(res, 400, (scan as { reason?: string }).reason ?? "Invalid file", "INVALID_FILE");
  }
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
  });
  if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });
  const now = new Date();
  const isActive = firm.billingStatus === "active";
  const inTrial = firm.billingStatus === "trial" && (!firm.trialEndsAt || firm.trialEndsAt > now);
  if (!isActive && !inTrial) {
    return res.status(402).json({ ok: false, error: "Billing required. Trial expired or inactive.", billingStatus: firm.billingStatus });
  }
  const docLimitCheck = await canIngestDocument(firmId);
  if (!docLimitCheck.allowed) {
    return res.status(402).json({ ok: false, error: docLimitCheck.error, docsProcessed: docLimitCheck.currentDocs, documentLimitMonthly: docLimitCheck.limit });
  }

  const fileSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const fileSizeBytes = file.buffer.length;
  const duplicatesEnabled = await hasFeature(firmId, "duplicates_detection");
  if (duplicatesEnabled) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existing = await prisma.document.findFirst({
      where: { firmId, file_sha256: fileSha256, fileSizeBytes, ingestedAt: { gte: since } },
      orderBy: { ingestedAt: "desc" },
      select: { id: true, spacesKey: true },
    });
    if (existing) {
      const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      await prisma.usageMonthly.upsert({
        where: { firmId_yearMonth: { firmId, yearMonth: ym } },
        create: { firmId, yearMonth: ym, pagesProcessed: 0, docsProcessed: 0, insuranceDocsExtracted: 0, courtDocsExtracted: 0, narrativeGenerated: 0, duplicateDetected: 1 },
        update: { duplicateDetected: { increment: 1 } },
      });
      await prisma.document.update({ where: { id: existing.id }, data: { duplicateMatchCount: { increment: 1 } } });
      const doc = await prisma.document.create({
        data: {
          firmId,
          source,
          spacesKey: existing.spacesKey,
          originalName: normalizeFilename(file.originalname),
          mimeType: file.mimetype || "application/octet-stream",
          pageCount: 0,
          status: "UPLOADED",
          processingStage: "complete",
          external_id: externalId ?? null,
          file_sha256: fileSha256,
          fileSizeBytes,
          duplicateOfId: existing.id,
          ingestedAt: now,
          processedAt: now,
          metaJson: buildOriginalMetadata({ originalFilename: file.originalname, sizeBytes: file.size, mimeType: file.mimetype || "application/octet-stream" }),
        },
      });
      return res.json({ ok: true, duplicate: true, documentId: doc.id, existingId: existing.id, spacesKey: existing.spacesKey });
    }
  }

  const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
  const key = `${firmId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await putObject(key, file.buffer, file.mimetype || "application/octet-stream");
  const originalMeta = buildOriginalMetadata({ originalFilename: file.originalname, sizeBytes: file.size, mimeType: file.mimetype || "application/octet-stream" });
  const doc = await prisma.document.create({
    data: {
      firmId,
      source,
      spacesKey: key,
      originalName: originalMeta.normalizedFilename,
      mimeType: originalMeta.mimeType,
      pageCount: 0,
      status: "RECEIVED",
      external_id: externalId ?? null,
      file_sha256: fileSha256,
      fileSizeBytes,
      ingestedAt: now,
      metaJson: originalMeta,
    },
  });
  try {
    await enqueueDocumentJob({ documentId: doc.id, firmId });
  } catch (e: unknown) {
    const errMsg = (e as Error)?.message ?? "Failed to enqueue processing";
    logIntakeFailure({
      stage: "enqueue",
      error: errMsg,
      code: "ENQUEUE_FAILED",
      firmId,
      fileName: file.originalname,
      sizeBytes: file.buffer?.length,
      documentId: doc.id,
    });
    await prisma.document.update({ where: { id: doc.id }, data: { status: "FAILED", failureStage: "ingest", failureReason: errMsg.slice(0, 2000) });
    return res.status(500).json({ ok: false, error: errMsg });
  }
  res.json({ ok: true, documentId: doc.id, spacesKey: key });
});

const ME_INGEST_BULK_MAX = 50;

app.post("/me/ingest/bulk", auth, requireRole(Role.STAFF), rateLimitEndpoint(30, "ingest_bulk"), upload.array("files", ME_INGEST_BULK_MAX), async (req, res) => {
  const firmId = (req as any).firmId as string;
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) return res.status(400).json({ ok: false, error: "No files (use multipart field 'files')" });

  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { pageLimitMonthly: true, billingStatus: true, trialEndsAt: true } });
  if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });
  const now = new Date();
  const isActive = firm.billingStatus === "active";
  const inTrial = firm.billingStatus === "trial" && (!firm.trialEndsAt || firm.trialEndsAt > now);
  if (!isActive && !inTrial) {
    return res.status(402).json({ ok: false, error: "Billing required.", billingStatus: firm.billingStatus });
  }
  let docLimitCheck = await canIngestDocument(firmId);
  if (!docLimitCheck.allowed) {
    return res.status(402).json({ ok: false, error: docLimitCheck.error, docsProcessed: docLimitCheck.currentDocs, documentLimitMonthly: docLimitCheck.limit });
  }

  const documentIds: string[] = [];
  const duplicateIndices: number[] = [];
  const errors: { file: string; error: string }[] = [];
  const duplicatesEnabled = await hasFeature(firmId, "duplicates_detection");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let fileIndex = 0;
  for (const file of files) {
    const scan = await validateUploadFile({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    if (!scan.ok) {
      const reason = (scan as { reason?: string }).reason ?? "Invalid file";
      logIntakeFailure({
        stage: "validation",
        error: reason,
        code: "INVALID_FILE",
        firmId,
        fileName: file.originalname,
        sizeBytes: file.size,
      });
      errors.push({ file: file.originalname || "unknown", error: reason });
      fileIndex++;
      continue;
    }
    const fileSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const fileSizeBytes = file.buffer.length;

    if (duplicatesEnabled) {
      const existing = await prisma.document.findFirst({
        where: { firmId, file_sha256: fileSha256, fileSizeBytes, ingestedAt: { gte: since } },
        orderBy: { ingestedAt: "desc" },
        select: { id: true },
      });
      if (existing) {
        const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        await prisma.usageMonthly.upsert({
          where: { firmId_yearMonth: { firmId, yearMonth: ym } },
          create: { firmId, yearMonth: ym, pagesProcessed: 0, docsProcessed: 0, insuranceDocsExtracted: 0, courtDocsExtracted: 0, narrativeGenerated: 0, duplicateDetected: 1 },
          update: { duplicateDetected: { increment: 1 } },
        }).catch(() => {});
        await prisma.document.update({ where: { id: existing.id }, data: { duplicateMatchCount: { increment: 1 } } }).catch(() => {});
        documentIds.push(existing.id);
        duplicateIndices.push(fileIndex);
        fileIndex++;
        continue;
      }
    }
    fileIndex++;

    docLimitCheck = await canIngestDocument(firmId);
    if (!docLimitCheck.allowed) {
      errors.push({ file: file.originalname || "unknown", error: docLimitCheck.error });
      continue;
    }

    const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
    const key = `${firmId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
    await putObject(key, file.buffer, file.mimetype || "application/octet-stream");
    const originalMeta = buildOriginalMetadata({ originalFilename: file.originalname, sizeBytes: file.size, mimeType: file.mimetype || "application/octet-stream" });
    const doc = await prisma.document.create({
      data: {
        firmId,
        source: "upload",
        spacesKey: key,
        originalName: originalMeta.normalizedFilename,
        mimeType: originalMeta.mimeType,
        pageCount: 0,
        status: "RECEIVED",
        file_sha256: fileSha256,
        fileSizeBytes,
        ingestedAt: now,
        metaJson: originalMeta,
      },
    });
    try {
      await enqueueDocumentJob({ documentId: doc.id, firmId });
      documentIds.push(doc.id);
    } catch (e) {
      const errMsg = (e as Error)?.message ?? "Enqueue failed";
      logIntakeFailure({
        stage: "enqueue",
        error: errMsg,
        code: "ENQUEUE_FAILED",
        firmId,
        fileName: file.originalname,
        sizeBytes: file.buffer?.length,
        documentId: doc.id,
      });
      await prisma.document.update({ where: { id: doc.id }, data: { status: "FAILED", failureStage: "ingest", failureReason: errMsg.slice(0, 2000) });
      errors.push({ file: file.originalname || "unknown", error: errMsg });
    }
    fileIndex++;
  }

  res.json({
    ok: true,
    documentIds,
    queued: documentIds.length,
    totalFiles: files.length,
    duplicatesDetected: duplicateIndices.length,
    ...(duplicateIndices.length > 0 ? { duplicateIndices } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  });
});

// --- Legacy migration (bulk import backfile) ---
const MIGRATION_MAX_FILES_PER_REQUEST = 200;

app.post(
  "/migration/import",
  auth,
  requireRole(Role.STAFF),
  rateLimitEndpoint(20, "migration_import"),
  upload.array("files", MIGRATION_MAX_FILES_PER_REQUEST),
  async (req, res) => {
    try {
      const firmId = (req as any).firmId as string;
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.status(400).json({ ok: false, error: "No files (use multipart field 'files')" });
      }

      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
      });
      if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });
      const now = new Date();
      const isActive = firm.billingStatus === "active";
      const inTrial = firm.billingStatus === "trial" && (!firm.trialEndsAt || firm.trialEndsAt > now);
      if (!isActive && !inTrial) {
        return res.status(402).json({
          ok: false,
          error: "Billing required for migration.",
          billingStatus: firm.billingStatus,
        });
      }

      const batchId = "mig_" + crypto.randomBytes(12).toString("hex");
      const documentIds: string[] = [];
      const errors: { file: string; error: string }[] = [];

      for (const file of files) {
        const scan = await validateUploadFile({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer,
        });
        if (!scan.ok) {
          logIntakeFailure({
            stage: "validation",
            error: (scan as { reason?: string }).reason ?? "Invalid file",
            code: "INVALID_FILE",
            firmId,
            fileName: file.originalname,
            sizeBytes: file.size,
          });
          errors.push({ file: file.originalname || "unknown", error: (scan as { reason?: string }).reason ?? "Invalid file" });
          continue;
        }
        const result = await ingestMigrationDocument({
          firmId,
          batchId,
          buffer: file.buffer,
          originalName: file.originalname || "document",
          mimeType: file.mimetype || "application/octet-stream",
        });
        if (result.ok) {
          documentIds.push(result.documentId);
        } else {
          errors.push({ file: file.originalname || "unknown", error: result.error });
        }
      }

      res.status(201).json({
        ok: true,
        batchId,
        documentIds,
        queued: documentIds.length,
        totalFiles: files.length,
        ...(errors.length > 0 ? { errors } : {}),
      });
    } catch (e: any) {
      console.error("POST /migration/import failed", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

app.get("/migration/batches", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 100);
    const { rows } = await pgPool.query<{ batch_id: string; ingested_at: Date }>(
      `SELECT "metaJson"->>'migrationBatchId' AS batch_id, MIN("ingestedAt") AS ingested_at
       FROM "Document"
       WHERE "firmId" = $1 AND "metaJson"->>'migrationBatchId' IS NOT NULL AND "metaJson"->>'migrationBatchId' != ''
       GROUP BY "metaJson"->>'migrationBatchId'
       ORDER BY MIN("ingestedAt") DESC
       LIMIT $2`,
      [firmId, limit]
    );
    const batches = rows.map((r) => ({ batchId: r.batch_id, createdAt: r.ingested_at?.toISOString() ?? null }));
    const migrationQueueLength = await getMigrationQueueLength();
    res.json({ ok: true, batches, migrationQueueLength });
  } catch (e: any) {
    console.error("GET /migration/batches failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/migration/batches/:batchId", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const batchId = String(req.params.batchId ?? "").trim();
    if (!batchId) return res.status(400).json({ ok: false, error: "batchId required" });

    const docs = await prisma.document.findMany({
      where: {
        firmId,
        metaJson: { path: ["migrationBatchId"], equals: batchId },
      },
      select: { id: true, status: true, originalName: true, failureStage: true, failureReason: true, processingStage: true },
    });

    if (docs.length === 0) {
      return res.status(404).json({ ok: false, error: "Batch not found" });
    }

    const byStatus: Record<string, number> = {};
    for (const d of docs) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    }
    const byStage: Record<string, number> = {};
    for (const d of docs) {
      const stage = d.processingStage ?? "uploaded";
      byStage[stage] = (byStage[stage] ?? 0) + 1;
    }

    res.json({
      ok: true,
      batchId,
      total: docs.length,
      byStatus,
      byStage,
      documentIds: docs.map((d) => d.id),
      failed: docs.filter((d) => d.status === "FAILED").map((d) => ({ id: d.id, originalName: d.originalName, failureStage: d.failureStage, failureReason: (d.failureReason ?? "").slice(0, 200) })),
    });
  } catch (e: any) {
    console.error("GET /migration/batches/:batchId failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Paperless Transition operational workflow (checklist, state, naming templates, CRM placeholders)
app.get("/me/paperless-transition/checklist", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const payload = await getChecklistWithState(firmId);
    res.json({ ok: true, ...payload });
  } catch (e: any) {
    console.error("GET /me/paperless-transition/checklist failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/me/paperless-transition/state", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body || {}) as {
      currentStepId?: PaperlessTransitionStepId | null;
      completedStepIds?: PaperlessTransitionStepId[];
      notes?: string | null;
      crmMappingNotes?: Record<string, string> | null;
    };
    const state = await updatePaperlessTransitionState(firmId, {
      ...(body.currentStepId !== undefined && { currentStepId: body.currentStepId }),
      ...(body.completedStepIds !== undefined && { completedStepIds: body.completedStepIds }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.crmMappingNotes !== undefined && { crmMappingNotes: body.crmMappingNotes }),
    });
    res.json({ ok: true, state });
  } catch (e: any) {
    console.error("PATCH /me/paperless-transition/state failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
// === Firm-scoped endpoints ===

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

// Notifications center: GET /notifications (HTML page or JSON), PATCH /notifications/:id/read, PATCH /notifications/read-all
app.get("/notifications", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "notifications.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ ok: false, error: "Notifications page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 30, 100);
    const unreadOnly = req.query.unread === "true";
    const typeRaw = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
    const type = typeof typeRaw === "string" ? typeRaw.trim() : undefined;
    const items = await listNotifications(firmId, { limit, unreadOnly, type });
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

app.patch("/notifications/read-all", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const count = await markAllNotificationsRead(firmId);
    res.json({ ok: true, markedCount: count });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/notifications/:id/read", auth, requireRole(Role.STAFF), async (req, res) => {
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
      prisma.document.count({ where: { firmId, status: "NEEDS_REVIEW" } }),
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

// MVP analytics for product ops and demos (firm-scoped). Optional dateFrom, dateTo (ISO date).
app.get("/me/analytics", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const dateFromRaw = typeof req.query.dateFrom === "string" && req.query.dateFrom.trim() ? req.query.dateFrom.trim() : null;
    const dateToRaw = typeof req.query.dateTo === "string" && req.query.dateTo.trim() ? req.query.dateTo.trim() : null;
    const dateFrom = dateFromRaw ? new Date(dateFromRaw) : null;
    const dateTo = dateToRaw ? (() => {
      const d = new Date(dateToRaw);
      if (!isNaN(d.getTime())) {
        d.setUTCHours(23, 59, 59, 999);
        return d;
      }
      return null;
    })() : null;

    const whereBase: { firmId: string; ingestedAt?: { gte?: Date; lte?: Date } } = { firmId };
    if (dateFrom && !isNaN(dateFrom.getTime())) {
      whereBase.ingestedAt = whereBase.ingestedAt ?? {};
      (whereBase.ingestedAt as Record<string, Date>).gte = dateFrom;
    }
    if (dateTo && !isNaN(dateTo.getTime())) {
      whereBase.ingestedAt = whereBase.ingestedAt ?? {};
      (whereBase.ingestedAt as Record<string, Date>).lte = dateTo;
    }

    const [failedCount, needsReviewCount, routedCount, unmatchedCount, totalProcessedCount, latencyRow] = await Promise.all([
      prisma.document.count({ where: { ...whereBase, status: "FAILED" } }),
      prisma.document.count({ where: { ...whereBase, status: "NEEDS_REVIEW" } }),
      prisma.document.count({ where: { ...whereBase, status: "ROUTED" } }),
      prisma.document.count({ where: { ...whereBase, status: "UNMATCHED" } }),
      prisma.document.count({
        where: {
          ...whereBase,
          status: { in: ["SCANNED", "CLASSIFIED", "ROUTED", "NEEDS_REVIEW", "UPLOADED", "UNMATCHED", "FAILED"] },
        },
      }),
      (() => {
        const params: (string | Date)[] = [firmId];
        let sql = `SELECT AVG(EXTRACT(EPOCH FROM ("processedAt" - "ingestedAt")) * 1000)::float AS avg_ms
          FROM "Document"
          WHERE "firmId" = $1 AND "processedAt" IS NOT NULL AND "ingestedAt" IS NOT NULL`;
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
    ]);

    const totalRoutable = routedCount + needsReviewCount + unmatchedCount;
    const successfulRouteRatePct =
      totalRoutable > 0 ? Math.round((routedCount / totalRoutable) * 10000) / 100 : null;

    res.json({
      ok: true,
      totalDocumentsProcessed: totalProcessedCount,
      failedDocuments: failedCount,
      needsReviewDocuments: needsReviewCount,
      routedDocuments: routedCount,
      unmatchedDocuments: unmatchedCount,
      successfulRouteRatePct,
      avgProcessingLatencyMs: latencyRow.rows[0]?.avg_ms != null ? Math.round(latencyRow.rows[0].avg_ms) : null,
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
    });
  } catch (e: any) {
    console.error("GET /me/analytics failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Firm-level export folder/file naming rules (paperless workflow).
app.get("/me/export-naming", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const rules = await getFirmExportNamingRules(firmId);
    res.json({
      ok: true,
      rules: rules ?? { filePattern: null, folderPattern: null, folderByDocType: null },
      placeholders: ["caseNumber", "clientName", "caseTitle", "documentType", "providerName", "serviceDate", "originalName", "date"],
    });
  } catch (e: any) {
    console.error("GET /me/export-naming failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/me/export-naming", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { filePattern?: string; folderPattern?: string; folderByDocType?: Record<string, string> };
    const rules = await setFirmExportNamingRules(firmId, {
      filePattern: body.filePattern !== undefined ? (body.filePattern ?? null) : undefined,
      folderPattern: body.folderPattern !== undefined ? (body.folderPattern ?? null) : undefined,
      folderByDocType: body.folderByDocType !== undefined ? body.folderByDocType ?? null : undefined,
    });
    res.json({ ok: true, rules });
  } catch (e: any) {
    console.error("PATCH /me/export-naming failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Firm-level paperless workflow settings (preferred export mode, review required, CRM vs standalone).
app.get("/me/paperless-settings", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const [paperless, exportNaming] = await Promise.all([
      getPaperlessSettings(firmId),
      getFirmExportNamingRules(firmId),
    ]);
    res.json({
      ok: true,
      paperless,
      exportNaming: exportNaming ?? { filePattern: null, folderPattern: null, folderByDocType: null },
    });
  } catch (e: any) {
    console.error("GET /me/paperless-settings failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/me/paperless-settings", auth, requireRole(Role.FIRM_ADMIN), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as {
      preferredExportMode?: string;
      reviewRequiredBeforeExport?: boolean;
      workflowMode?: string;
    };
    const paperless = await updatePaperlessSettings(firmId, {
      preferredExportMode: body.preferredExportMode as "download_bundle" | "cloud_drive" | "cloud_folder" | undefined,
      reviewRequiredBeforeExport: body.reviewRequiredBeforeExport,
      workflowMode: body.workflowMode as "crm" | "standalone" | undefined,
    });
    res.json({ ok: true, paperless });
  } catch (e: any) {
    console.error("PATCH /me/paperless-settings failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin MVP analytics
app.get("/admin/quality/mvp", auth, requireRole(Role.PLATFORM_ADMIN), async (req, res) => {
  try {
    const q = (req as any).query || {};
    const firmIdParam = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
    const dateFromRaw = typeof q.dateFrom === "string" && q.dateFrom.trim() ? q.dateFrom.trim() : null;
    const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim() ? q.dateTo.trim() : null;
    const dateFrom = dateFromRaw ? new Date(dateFromRaw) : null;
    const dateTo = dateToRaw ? (() => {
      const d = new Date(dateToRaw);
      if (!isNaN(d.getTime())) {
        d.setUTCHours(23, 59, 59, 999);
        return d;
      }
      return null;
    })() : null;

    const whereBase: { firmId?: string; ingestedAt?: { gte?: Date; lte?: Date } } = firmIdParam ? { firmId: firmIdParam } : {};
    if (dateFrom && !isNaN(dateFrom.getTime())) {
      whereBase.ingestedAt = whereBase.ingestedAt ?? {};
      (whereBase.ingestedAt as Record<string, Date>).gte = dateFrom;
    }
    if (dateTo && !isNaN(dateTo.getTime())) {
      whereBase.ingestedAt = whereBase.ingestedAt ?? {};
      (whereBase.ingestedAt as Record<string, Date>).lte = dateTo;
    }

    const [failedCount, needsReviewCount, routedCount, unmatchedCount, totalProcessedCount, latencyRow] = await Promise.all([
      prisma.document.count({ where: { ...whereBase, status: "FAILED" } }),
      prisma.document.count({ where: { ...whereBase, status: "NEEDS_REVIEW" } }),
      prisma.document.count({ where: { ...whereBase, status: "ROUTED" } }),
      prisma.document.count({ where: { ...whereBase, status: "UNMATCHED" } }),
      prisma.document.count({
        where: {
          ...whereBase,
          status: { in: ["SCANNED", "CLASSIFIED", "ROUTED", "NEEDS_REVIEW", "UPLOADED", "UNMATCHED", "FAILED"] },
        },
      }),
      (() => {
        const params: (string | Date)[] = [];
        let sql = `SELECT AVG(EXTRACT(EPOCH FROM ("processedAt" - "ingestedAt")) * 1000)::float AS avg_ms FROM "Document" WHERE "processedAt" IS NOT NULL AND "ingestedAt" IS NOT NULL`;
        if (firmIdParam) {
          params.push(firmIdParam);
          sql += ` AND "firmId" = $1`;
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
    ]);

    const totalRoutable = routedCount + needsReviewCount + unmatchedCount;
    const successfulRouteRatePct =
      totalRoutable > 0 ? Math.round((routedCount / totalRoutable) * 10000) / 100 : null;

    res.json({
      ok: true,
      totalDocumentsProcessed: totalProcessedCount,
      failedDocuments: failedCount,
      needsReviewDocuments: needsReviewCount,
      routedDocuments: routedCount,
      unmatchedDocuments: unmatchedCount,
      successfulRouteRatePct,
      avgProcessingLatencyMs: latencyRow.rows[0]?.avg_ms != null ? Math.round(latencyRow.rows[0].avg_ms) : null,
      dateFrom: dateFrom?.toISOString().slice(0, 10) ?? null,
      dateTo: dateTo?.toISOString().slice(0, 10) ?? null,
    });
  } catch (e: any) {
    console.error("GET /admin/quality/mvp failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
// Firm-wide audit log: recent document audit events
app.get("/me/audit-events", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(200, Math.max(1, parseInt(String(limitRaw || 100), 10) || 100));
    const actionFilter = req.query.action as string | undefined;
    const actions = actionFilter
      ? (typeof actionFilter === "string" ? actionFilter : Array.isArray(actionFilter) ? actionFilter[0] : "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : undefined;

    const where: { firmId: string; action?: { in: string[] } } = { firmId };
    if (actions && actions.length > 0) where.action = { in: actions };

    const events = await prisma.documentAuditEvent.findMany({
      where,
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
    console.error("GET /me/audit-events failed", e);
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
        select: { id: true, originalName: true, createdAt: true, failureStage: true, failureReason: true },
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
          failureStage: (d as { failureStage?: string | null }).failureStage ?? null,
          failureReason: (d as { failureReason?: string | null }).failureReason ?? null,
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

// CRM activity feed
app.get("/activity-feed", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseIdRaw = Array.isArray(req.query.caseId) ? req.query.caseId[0] : req.query.caseId;
    const caseId = typeof caseIdRaw === "string" && caseIdRaw.trim() ? caseIdRaw.trim() : null;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(100, Math.max(1, parseInt(String(limitRaw || 50), 10) || 50));

    const where: { firmId: string; caseId?: string } = { firmId };
    if (caseId) where.caseId = caseId;

    const items = await prisma.activityFeedItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        caseId: true,
        providerId: true,
        documentId: true,
        type: true,
        title: true,
        meta: true,
        createdAt: true,
      },
    });

    res.json({
      ok: true,
      items: items.map((i) => ({
        id: i.id,
        caseId: i.caseId,
        providerId: i.providerId,
        documentId: i.documentId,
        type: i.type,
        title: i.title,
        meta: i.meta,
        createdAt: i.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("GET /activity-feed failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Saved views (dashboard / review queue filters)
app.get("/saved-views", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const userId = (req as any).userId as string | undefined;
    const scopeRaw = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const scope = typeof scopeRaw === "string" && scopeRaw.trim() ? scopeRaw.trim() : null;

    const where: { firmId: string; scope?: string; OR: { userId: string | null }[] } = {
      firmId,
      OR: [{ userId: userId ?? null }, { userId: null }],
    };
    if (scope) where.scope = scope;
    const items = await prisma.savedView.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, scope: true, filtersJson: true, createdAt: true },
    });

    res.json({
      ok: true,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        scope: i.scope,
        filtersJson: i.filtersJson,
        createdAt: i.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("GET /saved-views failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/saved-views", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const userId = (req as any).userId as string | undefined;
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";
    const filtersJson = body.filtersJson != null ? body.filtersJson : {};

    if (!name) {
      res.status(400).json({ ok: false, error: "name is required" });
      return;
    }
    if (!scope) {
      res.status(400).json({ ok: false, error: "scope is required" });
      return;
    }
    const normalizedFilters =
      typeof filtersJson === "object" && filtersJson !== null ? filtersJson : {};

    const view = await prisma.savedView.create({
      data: {
        firmId,
        userId: userId || null,
        name,
        scope,
        filtersJson: normalizedFilters as Prisma.InputJsonValue,
      },
      select: { id: true, name: true, scope: true, filtersJson: true, createdAt: true },
    });

    res.status(201).json({
      ok: true,
      item: {
        id: view.id,
        name: view.name,
        scope: view.scope,
        filtersJson: view.filtersJson,
        createdAt: view.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("POST /saved-views failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete("/saved-views/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? "");
    const view = await prisma.savedView.findFirst({
      where: { id, firmId },
    });
    if (!view) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    await prisma.savedView.delete({ where: { id, firmId } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /saved-views/:id failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Daily operations digest: GET /dashboard/daily-digest
app.get("/dashboard/daily-digest", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setUTCHours(23, 59, 59, 999);

    const [
      newDocsTodayCount,
      newDocsTodayItems,
      processingCount,
      processingItems,
      unmatchedCount,
      unmatchedItems,
      failedCount,
      failedItems,
      overdueCount,
      overdueItems,
      requestsSentTodayCount,
      requestsSentTodayItems,
      latestNotifications,
    ] = await Promise.all([
      prisma.document.count({
        where: { firmId, ingestedAt: { gte: startOfToday, lte: endOfToday } },
      }),
      prisma.document.findMany({
        where: { firmId, ingestedAt: { gte: startOfToday, lte: endOfToday } },
        select: { id: true, originalName: true, ingestedAt: true },
        orderBy: { ingestedAt: "desc" },
        take: 20,
      }),
      prisma.document.count({
        where: { firmId, status: { in: ["RECEIVED", "PROCESSING"] } },
      }),
      prisma.document.findMany({
        where: { firmId, status: { in: ["RECEIVED", "PROCESSING"] } },
        select: { id: true, originalName: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.document.count({ where: { firmId, status: "UNMATCHED" } }),
      prisma.document.findMany({
        where: { firmId, status: "UNMATCHED" },
        select: { id: true, originalName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.document.count({ where: { firmId, status: "FAILED" } }),
      prisma.document.findMany({
        where: { firmId, status: "FAILED" },
        select: { id: true, originalName: true, createdAt: true, failureStage: true, failureReason: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.caseTask.count({ where: { firmId, completedAt: null, dueDate: { lt: now } } }),
      prisma.caseTask.findMany({
        where: { firmId, completedAt: null, dueDate: { lt: now } },
        select: { id: true, title: true, dueDate: true, caseId: true },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      prisma.recordsRequestAttempt.count({
        where: { firmId, ok: true, createdAt: { gte: startOfToday, lte: endOfToday } },
      }),
      prisma.recordsRequestAttempt.findMany({
        where: { firmId, ok: true, createdAt: { gte: startOfToday, lte: endOfToday } },
        select: {
          id: true,
          recordsRequestId: true,
          channel: true,
          createdAt: true,
          recordsRequest: { select: { providerName: true, caseId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      listNotifications(firmId, { limit: 15 }),
    ]);

    res.json({
      ok: true,
      date: startOfToday.toISOString().slice(0, 10),
      newDocsToday: {
        count: newDocsTodayCount,
        items: newDocsTodayItems.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          ingestedAt: d.ingestedAt.toISOString(),
        })),
      },
      docsStillProcessing: {
        count: processingCount,
        items: processingItems.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          status: d.status,
          createdAt: d.createdAt.toISOString(),
        })),
      },
      unmatchedDocs: {
        count: unmatchedCount,
        items: unmatchedItems.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          createdAt: d.createdAt.toISOString(),
        })),
      },
      failedDocs: {
        count: failedCount,
        items: failedItems.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          createdAt: d.createdAt.toISOString(),
          failureStage: (d as { failureStage?: string | null }).failureStage ?? null,
          failureReason: (d as { failureReason?: string | null }).failureReason ?? null,
        })),
      },
      overdueTasks: {
        count: overdueCount,
        items: overdueItems.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate?.toISOString() ?? null,
          caseId: t.caseId,
        })),
      },
      requestsSentToday: {
        count: requestsSentTodayCount,
        items: requestsSentTodayItems.map((a) => ({
          id: a.id,
          recordsRequestId: a.recordsRequestId,
          channel: a.channel,
          createdAt: a.createdAt.toISOString(),
          providerName: (a as any).recordsRequest?.providerName ?? null,
          caseId: (a as any).recordsRequest?.caseId ?? null,
        })),
      },
      latestNotifications: latestNotifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        meta: n.meta,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("GET /dashboard/daily-digest failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Dashboard "Needs Attention" panel: GET /dashboard/attention returns JSON; GET /dashboard serves dashboard page
app.get("/dashboard/attention", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const now = new Date();

    const [unmatchedDocs, failedDocs, overdueTasks, openReviewDocs, recordsWithFailedAttempts, recentFailures] =
      await Promise.all([
        prisma.document.findMany({
          where: { firmId, status: "UNMATCHED" },
          select: { id: true, originalName: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.document.findMany({
          where: { firmId, status: "FAILED" },
          select: { id: true, originalName: true, createdAt: true, failureStage: true, failureReason: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.caseTask.findMany({
          where: { firmId, completedAt: null, dueDate: { lt: now } },
          select: { id: true, title: true, dueDate: true, caseId: true },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),
        prisma.document.findMany({
          where: { firmId, status: "NEEDS_REVIEW" },
          select: { id: true, originalName: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.recordsRequest.findMany({
          where: { firmId, attempts: { some: { ok: false } } },
          select: { id: true, providerName: true, caseId: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.recordsRequestAttempt.findMany({
          where: { firmId, ok: false },
          select: {
            id: true,
            recordsRequestId: true,
            error: true,
            createdAt: true,
            recordsRequest: { select: { caseId: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    const [unmatchedCount, failedCount, overdueCount, openReviewCount, recordsNeedingFollowUpCount, recentFailuresCount] =
      await Promise.all([
        prisma.document.count({ where: { firmId, status: "UNMATCHED" } }),
        prisma.document.count({ where: { firmId, status: "FAILED" } }),
        prisma.caseTask.count({ where: { firmId, completedAt: null, dueDate: { lt: now } } }),
        prisma.document.count({ where: { firmId, status: "NEEDS_REVIEW" } }),
        prisma.recordsRequest.count({
          where: { firmId, attempts: { some: { ok: false } } },
        }),
        prisma.recordsRequestAttempt.count({ where: { firmId, ok: false } }),
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
          failureStage: (d as { failureStage?: string | null }).failureStage ?? null,
          failureReason: (d as { failureReason?: string | null }).failureReason ?? null,
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
      openReviewDocuments: {
        count: openReviewCount,
        items: openReviewDocs.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          createdAt: d.createdAt.toISOString(),
        })),
      },
      recordsRequestsNeedingFollowUp: {
        // Requests with ≥1 failed send attempt; dashboard label: "Records requests with failed sends"
        count: recordsNeedingFollowUpCount,
        items: recordsWithFailedAttempts.map((r) => ({
          id: r.id,
          providerName: r.providerName,
          caseId: r.caseId,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      recentRequestSendFailures: {
        count: recentFailuresCount,
        items: recentFailures.map((a) => ({
          id: a.id,
          recordsRequestId: a.recordsRequestId,
          caseId: (a as any).recordsRequest?.caseId ?? null,
          error: a.error,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    });
  } catch (e: any) {
    console.error("GET /dashboard/attention failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/dashboard", auth, requireRole(Role.STAFF), (req, res) => {
  const p = path.join(__dirname, "..", "..", "public", "admin", "dashboard.html");
  res.sendFile(p, (err) => {
    if (err) res.status(404).json({ ok: false, error: "Dashboard page not found" });
  });
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
  const firmId = (req as any).firmId as string;

  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true, name: true, plan: true, pageLimitMonthly: true, retentionDays: true, status: true },
  });
  if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

  const usageRow = await prisma.usageMonthly.findUnique({
    where: { firmId_yearMonth: { firmId, yearMonth: ym } },
    select: {
      yearMonth: true,
      pagesProcessed: true,
      docsProcessed: true,
      insuranceDocsExtracted: true,
      courtDocsExtracted: true,
      narrativeGenerated: true,
      duplicateDetected: true,
      updatedAt: true,
    },
  });

  const usage = usageRow
    ? {
        yearMonth: usageRow.yearMonth,
        pagesProcessed: usageRow.pagesProcessed,
        docsProcessed: usageRow.docsProcessed,
        insuranceDocsExtracted: usageRow.insuranceDocsExtracted,
        courtDocsExtracted: usageRow.courtDocsExtracted,
        narrativeGenerated: usageRow.narrativeGenerated,
        duplicateDetected: usageRow.duplicateDetected,
        updatedAt: usageRow.updatedAt,
      }
    : {
        yearMonth: ym,
        pagesProcessed: 0,
        docsProcessed: 0,
        insuranceDocsExtracted: 0,
        courtDocsExtracted: 0,
        narrativeGenerated: 0,
        duplicateDetected: 0,
        updatedAt: null as Date | null,
      };

  const monthsParam = Array.isArray(req.query.months) ? req.query.months[0] : req.query.months;
  const monthsCount = Math.min(Math.max(parseInt(String(monthsParam ?? "0"), 10) || 0, 0), 24);
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
    firm: { id: firm.id, name: firm.name, plan: firm.plan, pageLimitMonthly: firm.pageLimitMonthly, retentionDays: firm.retentionDays, status: firm.status },
    usage: {
      pagesProcessed: usage.pagesProcessed,
      docsProcessed: usage.docsProcessed,
      insuranceDocsExtracted: usage.insuranceDocsExtracted,
      courtDocsExtracted: usage.courtDocsExtracted,
      narrativeGenerated: usage.narrativeGenerated,
      duplicateDetected: usage.duplicateDetected,
      ...(usage.yearMonth ? { yearMonth: usage.yearMonth } : {}),
      ...(usage.updatedAt ? { updatedAt: usage.updatedAt } : {}),
    },
    ...(usageByMonth.length > 0 ? { usageByMonth } : {}),
  });
});

// Billing status (plan, usage, limit, status, trial end)
app.get("/billing/status", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        plan: true,
        pageLimitMonthly: true,
        billingStatus: true,
        trialEndsAt: true,
      },
    });
    if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

    const usageRow = await prisma.usageMonthly.findUnique({
      where: { firmId_yearMonth: { firmId, yearMonth: ym } },
      select: { pagesProcessed: true, docsProcessed: true },
    });

    const documentLimitMonthly = await getDocLimitForFirm(firmId);
    const overage = await getOverageForPeriod(firmId, ym);
    const planMeta = getPlanMetadata(firm.plan);

    res.json({
      ok: true,
      firm: {
        id: firm.id,
        name: firm.name,
        plan: firm.plan,
        pageLimitMonthly: firm.pageLimitMonthly,
        documentLimitMonthly,
        billingStatus: firm.billingStatus,
        trialEndsAt: firm.trialEndsAt?.toISOString() ?? null,
        planMetadata: planMeta ? { name: planMeta.name, priceMonthlyDollars: planMeta.priceMonthlyDollars, overagePerDocDollars: planMeta.overagePerDocDollars } : null,
      },
      usage: {
        yearMonth: ym,
        pagesProcessed: usageRow?.pagesProcessed ?? 0,
        docsProcessed: usageRow?.docsProcessed ?? 0,
      },
      overage: overage ? { overageDocs: overage.overageDocs, overageDollars: overage.overageDollars, overageCents: overage.overageCents } : null,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Plan metadata for display (website pricing parity)
app.get("/billing/plans", auth, requireRole(Role.STAFF), async (_req, res) => {
  try {
    const plans = listPlansForDisplay();
    res.json({ ok: true, plans });
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
    if (typeof body.plan === "string" && body.plan.trim()) data.plan = body.plan.trim();
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
  const firmId = (req as any).firmId as string;
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true, name: true, plan: true, pageLimitMonthly: true, retentionDays: true, status: true },
  });
  if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

  const usageRow = await prisma.usageMonthly.findUnique({
    where: { firmId_yearMonth: { firmId, yearMonth: ym } },
    select: { yearMonth: true, pagesProcessed: true, docsProcessed: true, updatedAt: true },
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
    },
    usage: {
      yearMonth: usageRow?.yearMonth ?? ym,
      pagesProcessed: usageRow?.pagesProcessed ?? 0,
      docsProcessed: usageRow?.docsProcessed ?? 0,
      updatedAt: usageRow?.updatedAt ?? null,
    },
  });
});

// Latest documents (cursor pagination) with optional filters
app.get("/me/documents", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;

    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
    const statusRaw = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const providerRaw = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider;
    const caseIdRaw = Array.isArray(req.query.caseId) ? req.query.caseId[0] : req.query.caseId;
    const tagRaw = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
    const dateFromRaw = Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : req.query.dateFrom;
    const dateToRaw = Array.isArray(req.query.dateTo) ? req.query.dateTo[0] : req.query.dateTo;
    const hasSettlementOfferRaw = Array.isArray(req.query.hasSettlementOffer) ? req.query.hasSettlementOffer[0] : req.query.hasSettlementOffer;
    const duplicatesOnlyRaw = Array.isArray(req.query.duplicatesOnly) ? req.query.duplicatesOnly[0] : req.query.duplicatesOnly;

    const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "25"), 10) || 25, 1), 100);
    const cursor = cursorRaw ? String(cursorRaw) : null;

    const where: Record<string, unknown> = { firmId };

    if (statusRaw && String(statusRaw).trim()) {
      const statuses = String(statusRaw).trim().split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) where.status = statuses[0];
      else if (statuses.length > 1) where.status = { in: statuses };
    }

    if (caseIdRaw && String(caseIdRaw).trim()) {
      where.routedCaseId = String(caseIdRaw).trim();
    }

    if (providerRaw && String(providerRaw).trim()) {
      const providerId = String(providerRaw).trim();
      const casesWithProvider = await prisma.caseProvider.findMany({
        where: { firmId, providerId },
        select: { caseId: true },
      });
      const caseIds = casesWithProvider.map((c) => c.caseId);
      if (caseIds.length === 0) {
        where.routedCaseId = { in: [] };
      } else {
        where.routedCaseId = { in: caseIds };
      }
    }

    if (tagRaw && String(tagRaw).trim()) {
      const tagId = String(tagRaw).trim();
      const tag = await prisma.documentTag.findFirst({
        where: { id: tagId, firmId },
        select: { id: true },
      });
      if (!tag) {
        where.id = { in: [] };
      } else {
        where.tagLinks = { some: { tagId: tag.id } };
      }
    }

    if (dateFromRaw && String(dateFromRaw).trim()) {
      const d = new Date(String(dateFromRaw).trim());
      if (!isNaN(d.getTime())) {
        (where as any).createdAt = Object.assign((where as any).createdAt || {}, { gte: d });
      }
    }
    if (dateToRaw && String(dateToRaw).trim()) {
      const d = new Date(String(dateToRaw).trim());
      if (!isNaN(d.getTime())) {
        (where as any).createdAt = Object.assign((where as any).createdAt || {}, { lte: d });
      }
    }

    if (duplicatesOnlyRaw === "true" || duplicatesOnlyRaw === "1") {
      where.OR = [
        { duplicateOfId: { not: null } },
        { duplicateMatchCount: { gt: 0 } },
      ];
    }

    if (hasSettlementOfferRaw === "true" || hasSettlementOfferRaw === "1") {
      const { rows: offerRows } = await pgPool.query<{ document_id: string }>(
        `SELECT document_id FROM document_recognition WHERE (insurance_fields->>'settlementOffer') IS NOT NULL AND (insurance_fields->>'settlementOffer')::float > 0`
      );
      const docIdsWithOffer = (offerRows || []).map((r) => r.document_id).filter(Boolean);
      if (docIdsWithOffer.length === 0) {
        where.id = { in: [] };
      } else {
        const inFirm = await prisma.document.findMany({
          where: { id: { in: docIdsWithOffer }, firmId },
          select: { id: true },
        });
        const ids = inFirm.map((d) => d.id);
        if (ids.length === 0) where.id = { in: [] };
        else where.id = { in: ids };
      }
    }

    const docs = await prisma.document.findMany({
      where: where as any,
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
        failureStage: true,
        failureReason: true,
        thumbnailKey: true,
      },
    });

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    const docIds = page.map((d: { id: string }) => d.id);

    const tagLinks =
      docIds.length > 0
        ? await prisma.documentTagLink.findMany({
            where: { documentId: { in: docIds } },
            include: { tag: { select: { id: true, name: true, color: true } } },
          })
        : [];
    const tagsByDoc = new Map<string, { id: string; name: string; color: string | null }[]>();
    for (const l of tagLinks) {
      const list = tagsByDoc.get(l.documentId) || [];
      list.push({ id: l.tag.id, name: l.tag.name, color: l.tag.color });
      tagsByDoc.set(l.documentId, list);
    }

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

  const items = page.map((d: (typeof page)[number]) => ({
    id: d.id,
    source: d.source,
    originalName: d.originalName,
    mimeType: d.mimeType,
    pageCount: d.pageCount,
    status: d.status,
    spacesKey: d.spacesKey,
    routedCaseId: d.routedCaseId ?? null,
    createdAt: d.createdAt,
    processedAt: d.processedAt,
    routingStatus: d.routingStatus ?? null,
    lastAuditAction: lastAuditByDoc.get(d.id) ?? null,
    duplicateMatchCount: d.duplicateMatchCount ?? 0,
    duplicateOfId: d.duplicateOfId ?? null,
    processingStage: d.processingStage ?? "uploaded",
    failureStage: (d as { failureStage?: string | null }).failureStage ?? null,
    failureReason: (d as { failureReason?: string | null }).failureReason ?? null,
    insuranceFields: insuranceByDoc.get(d.id) ?? null,
    recognition: recognitionByDoc.get(d.id) ?? null,
    tags: tagsByDoc.get(d.id) ?? [],
    thumbnailKey: (d as { thumbnailKey?: string | null }).thumbnailKey ?? null,
  }));

  const itemsWithThumbUrls = await Promise.all(
    items.map(async (item) => {
      if (!item.thumbnailKey) return { ...item, thumbnailUrl: null as string | null };
      try {
        const thumbnailUrl = await getPresignedGetUrl(item.thumbnailKey, 300);
        return { ...item, thumbnailUrl };
      } catch {
        return { ...item, thumbnailUrl: null as string | null };
      }
    })
  );

  res.json({ items: itemsWithThumbUrls, nextCursor });
  } catch (e: any) {
    requestLog(req, "error", "me_documents_failed", { error: String(e?.message || e) });
    sendError(res, 500, String(e?.message || e), "INTERNAL_ERROR", (req as any).requestId);
  }
});

// Review queue: documents with recognition data for UI (cursor pagination)
// Only show docs that need review: routingStatus is null or "needs_review"
app.get("/me/review-queue", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
    const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "50"), 10) || 50, 1), 100);
    const cursor = cursorRaw ? String(cursorRaw) : null;

    const docs = await prisma.document.findMany({
      where: {
        firmId,
        status: { in: ["NEEDS_REVIEW", "UPLOADED", "UNMATCHED", "FAILED"] },
        OR: [{ routingStatus: null }, { routingStatus: "needs_review" }],
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
        failureStage: true,
        failureReason: true,
        metaJson: true,
      },
    });

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const docIds = page.map((d: { id: string }) => d.id);
    const { rows: recRows } =
      docIds.length > 0
        ? await pgPool.query(
            `select document_id, case_number, client_name, suggested_case_id, doc_type, confidence as doc_type_confidence, match_confidence, match_reason, unmatched_reason, classification_reason, classification_signals_json, classification_status, suggested_doc_type, provider_name, provider_name_normalized, provider_resolution_status,
              summary, risks, insights, insurance_fields, court_fields,
              detected_language, possible_languages, ocr_engine, ocr_confidence, has_handwriting, handwriting_heavy, page_diagnostics, extraction_strict_mode
              from document_recognition where document_id = any($1)`,
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
      classification_status?: string | null;
      suggested_doc_type?: string | null;
      provider_name?: string | null;
      provider_name_normalized?: string | null;
      provider_resolution_status?: string | null;
      summary?: unknown;
      client_name?: string;
      insurance_fields?: unknown;
      detected_language?: string | null;
      possible_languages?: unknown;
      ocr_engine?: string | null;
      ocr_confidence?: number | null;
      has_handwriting?: boolean | null;
      handwriting_heavy?: boolean | null;
      page_diagnostics?: unknown;
      extraction_strict_mode?: boolean | null;
    }
    const recByDoc = new Map<string, DocRecRow>(recRows.map((r: DocRecRow) => [r.document_id ?? "", r]));

    const claimed = await prisma.documentAuditEvent.findMany({
      where: {
        documentId: { in: docIds },
        firmId,
        action: "claimed",
      },
      orderBy: { createdAt: "desc" },
    });
    const lastClaimByDoc = new Map<string, string>();
    for (const e of claimed) {
      if (!lastClaimByDoc.has(e.documentId)) lastClaimByDoc.set(e.documentId, e.actor);
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

    /** Build human-readable reasons why this document is in the review queue. */
    function buildReviewReasons(
      doc: { status: string; failureStage?: string | null; failureReason?: string | null; metaJson?: unknown; duplicateOfId?: string | null },
      rec: DocRecRow | undefined,
      caseMatchConfidence: number | null,
      docTypeConfidence: number | null,
      suggestedCaseId: string | null
    ): string[] {
      const reasons: string[] = [];
      if (doc.duplicateOfId) reasons.push("Duplicate");
      if (doc.status === "FAILED") {
        reasons.push("Processing failed");
        if (doc.failureStage) reasons.push(`Failed at: ${doc.failureStage}`);
      }
      if (doc.status === "UNMATCHED") reasons.push("Unmatched case");
      if (rec?.classification_status === "uncertain") reasons.push("Uncertain classification");
      if (rec?.classification_status === "fallback") reasons.push("Unknown document type");
      if (caseMatchConfidence != null && caseMatchConfidence > 0 && caseMatchConfidence < 0.9 && suggestedCaseId)
        reasons.push("Low match confidence");
      if (docTypeConfidence != null && docTypeConfidence < 0.5) reasons.push("Low classification confidence");
      if (rec?.ocr_confidence != null && Number(rec.ocr_confidence) < 0.5) reasons.push("Low OCR confidence");
      const meta = doc.metaJson as Record<string, unknown> | null | undefined;
      if (meta?.extractionQuality === "unreadable") reasons.push("Unreadable (no text extracted)");
      if (meta?.extractionQuality === "low") reasons.push("Low quality extraction");
      if (doc.status === "NEEDS_REVIEW" && reasons.length === 0) reasons.push("Needs review");
      return reasons;
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
      const recommendation = routingRecommendation(caseMatchConfidence, suggestedCaseId);
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
      const reviewReasons = buildReviewReasons(
        d as { status: string; failureStage?: string | null; failureReason?: string | null; metaJson?: unknown; duplicateOfId?: string | null },
        rec,
        caseMatchConfidence,
        docTypeConfidence,
        suggestedCaseId
      );
      return {
        id: d.id,
        fileName: d.originalName,
        status: d.status,
        reviewReasons,
        clientName: rec?.client_name ?? (d.extractedFields as any)?.clientName ?? null,
        caseNumber: rec?.case_number ?? (d.extractedFields as any)?.caseNumber ?? null,
        suggestedCaseId,
        routedCaseId: d.routedCaseId,
        matchConfidence: caseMatchConfidence,
        matchReason,
        unmatchedReason: rec?.unmatched_reason ?? null,
        docTypeConfidence,
        classificationReason: rec?.classification_reason ?? null,
        classificationSignals: rec?.classification_signals_json ?? null,
        classificationStatus: rec?.classification_status ?? null,
        suggestedDocType: rec?.suggested_doc_type ?? null,
        routingRecommendation: recommendation,
        extractedFields: d.extractedFields,
        docType,
        createdAt: d.createdAt,
        claimedBy: lastClaimByDoc.get(d.id) ?? null,
        routingStatus: d.routingStatus ?? null,
        lastAuditAction: lastAuditByDoc.get(d.id) ?? null,
        providerName: rec?.provider_name ?? null,
        providerNameNormalized: rec?.provider_name_normalized ?? null,
        providerResolutionStatus: rec?.provider_resolution_status ?? null,
        risks,
        insights,
        summary: summaryPayload,
        insuranceFields: rec?.insurance_fields ?? null,
        duplicateOfId: d.duplicateOfId ?? null,
        ocrDiagnostics:
          rec != null &&
          (rec.detected_language != null ||
            rec.ocr_engine != null ||
            rec.ocr_confidence != null ||
            rec.has_handwriting != null)
            ? {
                detectedLanguage: rec.detected_language ?? null,
                possibleLanguages: rec.possible_languages ?? null,
                ocrEngine: rec.ocr_engine ?? null,
                ocrConfidence: rec.ocr_confidence != null ? Number(rec.ocr_confidence) : null,
                hasHandwriting: rec.has_handwriting ?? null,
                handwritingHeavy: rec.handwriting_heavy ?? null,
                pageDiagnostics: rec.page_diagnostics ?? null,
                extractionStrictMode: rec.extraction_strict_mode ?? null,
              }
            : null,
        failureStage: (d as { failureStage?: string | null }).failureStage ?? null,
        failureReason: (d as { failureReason?: string | null }).failureReason ?? null,
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
    const firmId = (req as any).firmId as string;
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

    const [cases, documents, providers, recordsRequests, notes, tasks] = await Promise.all([
      prisma.legalCase.findMany({
        where: {
          firmId,
          OR: [
            { title: ilike },
            { caseNumber: ilike },
            { clientName: ilike },
          ],
        },
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

    const notesWithCase = includeNotes ? notes : undefined;
    const tasksWithCase = includeTasks ? tasks : undefined;

    res.json({
      ok: true,
      cases: { count: cases.length, items: cases },
      documents: { count: documents.length, items: documents },
      providers: { count: providers.length, items: providers },
      recordsRequests: { count: recordsRequests.length, items: recordsRequests },
      ...(notesWithCase != null && { notes: { count: notesWithCase.length, items: notesWithCase } }),
      ...(tasksWithCase != null && { tasks: { count: tasksWithCase.length, items: tasksWithCase } }),
    });
  } catch (e: any) {
    console.error("Global search failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Review queue page (HTML)
app.get("/review-queue", auth, requireRole(Role.STAFF), (req, res) => {
  const p = path.join(__dirname, "..", "..", "public", "admin", "review-queue.html");
  res.sendFile(p, (err) => {
    if (err) res.status(404).json({ ok: false, error: "Review queue page not found" });
  });
});

// GET /search: HTML = search page; otherwise grouped global search
app.get("/search", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "search.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ ok: false, error: "Search page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const qRaw = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const q = typeof qRaw === "string" ? qRaw.trim() : "";

    const empty = {
      ok: true as const,
      cases: { count: 0, items: [] },
      documents: { count: 0, items: [] },
      providers: { count: 0, items: [] },
      recordsRequests: { count: 0, items: [] },
      notes: { count: 0, items: [] },
      tasks: { count: 0, items: [] },
    };

    if (!q || q.length < 1) {
      return res.json(empty);
    }

    const ilike = { contains: q, mode: "insensitive" as const };

    const [cases, documents, providers, recordsRequests, notes, tasks] = await Promise.all([
      prisma.legalCase.findMany({
        where: {
          firmId,
          OR: [
            { title: ilike },
            { caseNumber: ilike },
            { clientName: ilike },
          ],
        },
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
      prisma.caseNote.findMany({
        where: { firmId, body: ilike },
        select: { id: true, body: true, caseId: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),
      prisma.caseTask.findMany({
        where: { firmId, title: ilike },
        select: { id: true, title: true, caseId: true, completedAt: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      ok: true,
      cases: { count: cases.length, items: cases },
      documents: { count: documents.length, items: documents },
      providers: { count: providers.length, items: providers },
      recordsRequests: { count: recordsRequests.length, items: recordsRequests },
      notes: { count: notes.length, items: notes },
      tasks: { count: tasks.length, items: tasks },
    });
  } catch (e: any) {
    console.error("GET /search failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Feature flags for add-ons (insurance_extraction, court_extraction, demand_narratives)
app.get("/me/features", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const [insurance_extraction, court_extraction, demand_narratives, duplicates_detection, crm_sync, crm_push, case_insights, growth_extraction, premium_workflow] = await Promise.all([
      hasFeature(firmId, "insurance_extraction"),
      hasFeature(firmId, "court_extraction"),
      hasFeature(firmId, "demand_narratives"),
      hasFeature(firmId, "duplicates_detection"),
      hasFeature(firmId, "crm_sync"),
      hasFeature(firmId, "crm_push"),
      hasFeature(firmId, "case_insights"),
      hasFeature(firmId, "growth_extraction"),
      hasPremiumWorkflow(firmId),
    ]);
    res.json({ insurance_extraction, court_extraction, demand_narratives, duplicates_detection, crm_sync, crm_push, case_insights, growth_extraction, premium_workflow });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Premium workflow config (STAFF + premium_workflow)
app.get("/me/premium/workflow-config", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    if (!(await hasPremiumWorkflow(firmId))) {
      return res.status(403).json({ ok: false, error: "Premium workflow not enabled" });
    }
    const config = await getWorkflowConfig(firmId);
    res.json(config ?? {});
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/me/premium/workflow-config", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    if (!(await hasPremiumWorkflow(firmId))) {
      return res.status(403).json({ ok: false, error: "Premium workflow not enabled" });
    }
    const body = req.body as { minAutoRouteConfidenceOverride?: number; bulkRouteMaxPerRequest?: number; autoRouteExcludeDocTypes?: string[] };
    await setWorkflowConfig(firmId, body);
    await recordPremiumEvent(firmId, "workflow_config_change", { patch: body });
    const config = await getWorkflowConfig(firmId);
    res.json(config ?? {});
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Premium bulk document actions (STAFF + premium_workflow)
app.post("/me/documents/bulk-route", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const actor = (req as any).userId as string;
    if (!(await hasPremiumWorkflow(firmId))) {
      return res.status(403).json({ ok: false, error: "Premium workflow not enabled" });
    }
    const { documentIds, caseId } = req.body as { documentIds: string[]; caseId: string };
    if (!Array.isArray(documentIds) || !caseId) {
      return res.status(400).json({ ok: false, error: "documentIds (array) and caseId required" });
    }
    const result = await bulkRouteDocuments(firmId, documentIds, caseId, actor);
    await recordPremiumEvent(firmId, "bulk_route", { caseId, routed: result.routed, skipped: result.skipped, errors: result.errors?.length ?? 0 });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/me/documents/bulk-unroute", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const actor = (req as any).userId as string;
    if (!(await hasPremiumWorkflow(firmId))) {
      return res.status(403).json({ ok: false, error: "Premium workflow not enabled" });
    }
    const { documentIds } = req.body as { documentIds: string[] };
    if (!Array.isArray(documentIds)) {
      return res.status(400).json({ ok: false, error: "documentIds (array) required" });
    }
    const result = await bulkUnrouteDocuments(firmId, documentIds, actor);
    await recordPremiumEvent(firmId, "bulk_unroute", { routed: result.routed, skipped: result.skipped, errors: result.errors?.length ?? 0 });
    res.json(result);
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
    const onlyActiveRaw = Array.isArray(req.query.onlyActive) ? req.query.onlyActive[0] : req.query.onlyActive;

    const specialty = typeof specialtyRaw === "string" && specialtyRaw.trim() ? specialtyRaw.trim() : null;
    const city = typeof cityRaw === "string" && cityRaw.trim() ? cityRaw.trim() : null;
    const radiusKm = radiusRaw != null ? Math.max(0, Number(radiusRaw)) : null;
    const centerLat = latRaw != null ? Number(latRaw) : null;
    const centerLng = lngRaw != null ? Number(lngRaw) : null;
    const onlyActive = onlyActiveRaw === "true" || onlyActiveRaw === "1";

    const where: {
      firmId: string;
      lat?: { not: null };
      lng?: { not: null };
      city?: string;
      specialty?: string;
      listingActive?: boolean;
      OR?: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
    } = {
      firmId,
      lat: { not: null },
      lng: { not: null },
    };
    if (city) where.city = city;
    if (specialty) where.specialty = specialty;
    if (onlyActive) {
      where.listingActive = true;
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }

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
        hoursJson: true,
        serviceAreasJson: true,
        intakeInstructions: true,
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

// Provider map: raw names from document_recognition with doc count, normalized, and resolved provider (for management UI)
app.get("/me/provider-map", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 200, 500);
    const { rows } = await pgPool.query<{
      raw_name: string;
      normalized: string | null;
      resolution_status: string | null;
      suggested_provider_id: string | null;
      doc_count: string;
    }>(
      `SELECT
        COALESCE(TRIM(dr.provider_name), '') AS raw_name,
        dr.provider_name_normalized AS normalized,
        dr.provider_resolution_status AS resolution_status,
        dr.suggested_provider_id AS suggested_provider_id,
        COUNT(*)::text AS doc_count
       FROM document_recognition dr
       INNER JOIN "Document" d ON d.id = dr.document_id AND d."firmId" = $1
       WHERE dr.provider_name IS NOT NULL AND TRIM(dr.provider_name) <> ''
       GROUP BY dr.provider_name, dr.provider_name_normalized, dr.provider_resolution_status, dr.suggested_provider_id
       ORDER BY COUNT(*) DESC
       LIMIT $2`,
      [firmId, limit]
    );
    const providerIds = [...new Set(rows.map((r) => r.suggested_provider_id).filter(Boolean))] as string[];
    const providerNames =
      providerIds.length > 0
        ? await prisma.provider.findMany({
            where: { id: { in: providerIds }, firmId },
            select: { id: true, name: true },
          }).then((list) => new Map(list.map((p) => [p.id, p.name])))
        : new Map<string, string>();
    res.json({
      ok: true,
      items: rows.map((r) => ({
        rawName: r.raw_name,
        normalized: r.normalized ?? null,
        resolutionStatus: r.resolution_status ?? null,
        suggestedProviderId: r.suggested_provider_id ?? null,
        suggestedProviderName: r.suggested_provider_id ? providerNames.get(r.suggested_provider_id) ?? null : null,
        docCount: parseInt(r.doc_count, 10) || 0,
      })),
    });
  } catch (e: any) {
    console.error("GET /me/provider-map failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// List provider aliases for the firm (for management UI)
app.get("/me/provider-aliases", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const { rows } = await pgPool.query<{
      id: string;
      provider_id: string;
      alias_normalized: string;
      created_at: Date;
    }>(
      `SELECT a.id, a.provider_id, a.alias_normalized, a.created_at
       FROM provider_alias a
       WHERE a.firm_id = $1
       ORDER BY a.alias_normalized ASC`,
      [firmId]
    );
    const providerIds = [...new Set(rows.map((r) => r.provider_id))];
    const providerNames =
      providerIds.length > 0
        ? await prisma.provider.findMany({
            where: { id: { in: providerIds }, firmId },
            select: { id: true, name: true },
          }).then((list) => new Map(list.map((p) => [p.id, p.name])))
        : new Map<string, string>();
    res.json({
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        providerId: r.provider_id,
        providerName: providerNames.get(r.provider_id) ?? null,
        aliasNormalized: r.alias_normalized,
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("GET /me/provider-aliases failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Add a provider alias (map a normalized name to a provider)
app.post("/me/provider-aliases", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { providerId?: string; aliasNormalized?: string };
    const providerId = typeof body.providerId === "string" ? body.providerId.trim() : null;
    const aliasNormalized = typeof body.aliasNormalized === "string" ? body.aliasNormalized.trim() : null;
    if (!providerId || !aliasNormalized) {
      return res.status(400).json({ ok: false, error: "providerId and aliasNormalized are required" });
    }
    const provider = await prisma.provider.findFirst({
      where: { id: providerId, firmId },
      select: { id: true },
    });
    if (!provider) return res.status(404).json({ ok: false, error: "Provider not found" });
    const id = crypto.randomBytes(12).toString("hex");
    await pgPool.query(
      `INSERT INTO provider_alias (id, firm_id, provider_id, alias_normalized) VALUES ($1, $2, $3, $4)
       ON CONFLICT (firm_id, provider_id, alias_normalized) DO NOTHING`,
      [id, firmId, providerId, aliasNormalized]
    );
    const { rows } = await pgPool.query<{ id: string; created_at: Date }>(
      `SELECT id, created_at FROM provider_alias WHERE firm_id = $1 AND provider_id = $2 AND alias_normalized = $3`,
      [firmId, providerId, aliasNormalized]
    );
    const row = rows[0];
    res.status(201).json({
      ok: true,
      alias: row ? { id: row.id, providerId, aliasNormalized, createdAt: row.created_at.toISOString() } : { id, providerId, aliasNormalized },
    });
  } catch (e: any) {
    console.error("POST /me/provider-aliases failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Delete a provider alias
app.delete("/me/provider-aliases/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Alias id required" });
    const result = await pgPool.query(
      `DELETE FROM provider_alias WHERE id = $1 AND firm_id = $2`,
      [id, firmId]
    );
    if (!result.rowCount) return res.status(404).json({ ok: false, error: "Alias not found" });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /me/provider-aliases/:id failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
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
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "provider-detail.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ error: "Provider detail page not found" });
    });
  }
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

// Provider summary: profile + related cases, records requests, timeline events, recent documents
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

    const [caseLinks, relatedCasesCount, recordsRequests, recordsRequestsCount, timelineEvents, timelineDocIds] = await Promise.all([
      prisma.caseProvider.findMany({
        where: { firmId, providerId: id },
        include: {
          case: { select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.caseProvider.count({ where: { firmId, providerId: id } }),
      prisma.recordsRequest.findMany({
        where: { firmId, providerId: id },
        select: { id: true, providerName: true, status: true, caseId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.recordsRequest.count({ where: { firmId, providerId: id } }),
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
      prisma.caseTimelineEvent.findMany({
        where: { firmId, facilityId: id },
        select: { documentId: true },
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
    ]);

    const relatedCases = caseLinks.map((l) => ({ ...l.case, relationship: l.relationship }));
    const docIds = [...new Set(timelineDocIds.map((e) => e.documentId))];
    const recentDocuments =
      docIds.length === 0
        ? []
        : await prisma.document.findMany({
            where: { id: { in: docIds }, firmId },
            select: {
              id: true,
              originalName: true,
              status: true,
              processingStage: true,
              routedCaseId: true,
              createdAt: true,
              processedAt: true,
            },
            orderBy: { processedAt: "desc" },
            take: 10,
          });

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
        listingActive: provider.listingActive,
        expiresAt: provider.expiresAt,
        lat: provider.lat,
        lng: provider.lng,
        createdAt: provider.createdAt,
        hoursJson: provider.hoursJson,
        serviceAreasJson: provider.serviceAreasJson,
        intakeInstructions: provider.intakeInstructions,
      },
      relatedCasesCount,
      relatedCases,
      recordsRequestsCount,
      recentRecordsRequests: recordsRequests,
      recentTimelineEvents: timelineEvents,
      recentDocuments,
    });
  } catch (err) {
    console.error("Failed to get provider summary", err);
    res.status(500).json({ error: "Failed to get provider summary" });
  }
});

// Provider referrals
app.get("/providers/:id/referrals", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const providerId = String(req.params.id ?? "");

    const provider = await prisma.provider.findFirst({
      where: { id: providerId, firmId },
      select: { id: true },
    });
    if (!provider) return res.status(404).json({ ok: false, error: "Provider not found" });

    const referrals = await prisma.referral.findMany({
      where: { providerId, firmId },
      orderBy: { referredAt: "desc" },
      include: {
        case: { select: { id: true, title: true, caseNumber: true, clientName: true } },
      },
    });

    res.json({
      ok: true,
      items: referrals.map((r) => ({
        id: r.id,
        caseId: r.caseId,
        providerId: r.providerId,
        referredAt: r.referredAt.toISOString(),
        status: r.status,
        notes: r.notes,
        case: r.case,
      })),
    });
  } catch (e: any) {
    console.error("Failed to list provider referrals", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Provider invoices
app.get("/providers/:id/invoices", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const providerId = String(req.params.id ?? "");
    const provider = await prisma.provider.findFirst({
      where: { id: providerId, firmId },
      select: { id: true },
    });
    if (!provider) {
      return res.status(404).json({ ok: false, error: "Provider not found" });
    }
    const items = await prisma.providerInvoice.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      ok: true,
      items: items.map((inv) => ({
        id: inv.id,
        providerId: inv.providerId,
        amountCents: inv.amountCents,
        status: inv.status,
        billingPeriod: inv.billingPeriod,
        dueAt: inv.dueAt?.toISOString() ?? null,
        paidAt: inv.paidAt?.toISOString() ?? null,
        stripeInvoiceId: inv.stripeInvoiceId ?? null,
        createdAt: inv.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("GET /providers/:id/invoices", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/providers/:id/invoices", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const providerId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as {
      amountCents?: number;
      billingPeriod?: string;
      dueAt?: string;
      status?: string;
      stripeInvoiceId?: string;
    };
    const provider = await prisma.provider.findFirst({
      where: { id: providerId, firmId },
      select: { id: true },
    });
    if (!provider) {
      return res.status(404).json({ ok: false, error: "Provider not found" });
    }
    const amountCents = typeof body.amountCents === "number" ? body.amountCents : parseInt(String(body.amountCents ?? 0), 10);
    const billingPeriod = String(body.billingPeriod ?? "").trim() || null;
    if (!billingPeriod) {
      return res.status(400).json({ ok: false, error: "billingPeriod is required" });
    }
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    const status = String(body.status ?? "open").trim() || "open";
    const stripeInvoiceId = body.stripeInvoiceId ? String(body.stripeInvoiceId).trim() || null : null;

    const created = await prisma.providerInvoice.create({
      data: {
        providerId,
        amountCents,
        status,
        billingPeriod,
        dueAt,
        paidAt: status === "paid" ? new Date() : null,
        stripeInvoiceId,
      },
    });
    res.status(201).json({
      ok: true,
      item: {
        id: created.id,
        providerId: created.providerId,
        amountCents: created.amountCents,
        status: created.status,
        billingPeriod: created.billingPeriod,
        dueAt: created.dueAt?.toISOString() ?? null,
        paidAt: created.paidAt?.toISOString() ?? null,
        stripeInvoiceId: created.stripeInvoiceId ?? null,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("POST /providers/:id/invoices", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/provider-invoices/:id/pay-status", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const invoiceId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { status?: string; paidAt?: string };
    const invoice = await prisma.providerInvoice.findUnique({
      where: { id: invoiceId },
      include: { provider: { select: { firmId: true } } },
    });
    if (!invoice || invoice.provider.firmId !== firmId) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }
    const status = body.status != null ? String(body.status).trim() : null;
    if (!status) {
      return res.status(400).json({ ok: false, error: "status is required (e.g. paid, open)" });
    }
    const paidAt = status === "paid" ? (body.paidAt ? new Date(body.paidAt) : new Date()) : null;
    const updated = await prisma.providerInvoice.update({
      where: { id: invoiceId },
      data: { status, paidAt },
    });
    res.json({
      ok: true,
      item: {
        id: updated.id,
        providerId: updated.providerId,
        amountCents: updated.amountCents,
        status: updated.status,
        billingPeriod: updated.billingPeriod,
        dueAt: updated.dueAt?.toISOString() ?? null,
        paidAt: updated.paidAt?.toISOString() ?? null,
        stripeInvoiceId: updated.stripeInvoiceId ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("PATCH /provider-invoices/:id/pay-status", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
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

// Provider monetization: verify toggle (firm admin or platform admin)
app.patch("/providers/:id/verify", auth, requireAdminOrFirmAdminForProvider, async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { verified?: boolean };
    const verified = body.verified === true;

    const updated = await prisma.provider.update({
      where: { id },
      data: { verified },
    });
    res.json(updated);
  } catch (err: any) {
    console.error("Failed to update provider verify", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.status(500).json({ error: "Failed to update provider verify" });
  }
});

// Provider monetization: subscription tier (and optional listingActive, expiresAt)
app.patch("/providers/:id/subscription", auth, requireAdminOrFirmAdminForProvider, async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { subscriptionTier?: string; listingActive?: boolean; expiresAt?: string | null };
    const data: { subscriptionTier?: string; listingActive?: boolean; expiresAt?: Date | null } = {};
    if (body.subscriptionTier !== undefined) data.subscriptionTier = String(body.subscriptionTier);
    if (body.listingActive !== undefined) data.listingActive = body.listingActive === true;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt == null || body.expiresAt === "" ? null : new Date(body.expiresAt);

    const updated = await prisma.provider.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (err: any) {
    console.error("Failed to update provider subscription", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.status(500).json({ error: "Failed to update provider subscription" });
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
        verified: body.verified !== undefined ? body.verified === true : undefined,
        subscriptionTier: body.subscriptionTier !== undefined ? body.subscriptionTier : undefined,
        listingActive: body.listingActive !== undefined ? body.listingActive === true : undefined,
        expiresAt: body.expiresAt !== undefined ? (body.expiresAt == null || body.expiresAt === "" ? null : new Date(body.expiresAt)) : undefined,
        ...(body.hoursJson !== undefined && (() => {
          try {
            if (body.hoursJson == null) return { hoursJson: Prisma.JsonNull };
            const v = typeof body.hoursJson === "object" ? body.hoursJson : JSON.parse(String(body.hoursJson));
            return { hoursJson: v as Prisma.InputJsonValue };
          } catch { return {}; }
        })()),
        ...(body.serviceAreasJson !== undefined && (() => {
          try {
            if (body.serviceAreasJson == null) return { serviceAreasJson: Prisma.JsonNull };
            const v = Array.isArray(body.serviceAreasJson) || typeof body.serviceAreasJson === "object"
              ? body.serviceAreasJson
              : JSON.parse(String(body.serviceAreasJson));
            return { serviceAreasJson: v as Prisma.InputJsonValue };
          } catch { return {}; }
        })()),
        intakeInstructions: body.intakeInstructions !== undefined ? (body.intakeInstructions == null || body.intakeInstructions === "" ? null : String(body.intakeInstructions)) : undefined,
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

// Document tags (firm-level)
app.get("/document-tags", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const tags = await prisma.documentTag.findMany({
      where: { firmId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    });
    res.json({ ok: true, items: tags });
  } catch (e: any) {
    console.error("GET /document-tags failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/document-tags", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { name?: string; color?: string | null };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    const color = body.color != null && typeof body.color === "string" ? body.color.trim() || null : null;
    const tag = await prisma.documentTag.create({
      data: { firmId, name, color },
      select: { id: true, name: true, color: true },
    });
    res.status(201).json({ ok: true, item: tag });
  } catch (e: any) {
    console.error("POST /document-tags failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

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
            metaJson: { bulk: true },
          });
          updated++;
        } else if (action === "mark_unmatched") {
          await prisma.document.update({
            where: { id: doc.id },
            data: { status: "UNMATCHED", routedCaseId: null, routedSystem: null, routingStatus: null },
          });
          await recordReviewQueueExit(firmId, doc.id, "unmatched");
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
          await prisma.document.update({
            where: { id: doc.id },
            data: { status: "NEEDS_REVIEW", routingStatus: "needs_review" },
          });
          await recordReviewQueueEnter(firmId, doc.id);
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

// Merge PDFs into a single new document
app.post("/documents/merge", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as { documentIds?: string[] };
    const documentIds = Array.isArray(body.documentIds)
      ? body.documentIds.map((id) => String(id)).filter(Boolean)
      : [];
    if (documentIds.length < 2) {
      return res.status(400).json({ ok: false, error: "documentIds must be an array of at least 2 document IDs" });
    }
    const { mergeDocuments } = await import("../services/documentMerge");
    const result = await mergeDocuments({ firmId, documentIds });
    res.status(201).json({ ok: true, document: result });
  } catch (e: any) {
    console.error("POST /documents/merge failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/recognize", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

    // Fetch document storage key from Document table (firm-scoped to prevent IDOR)
    const { rows } = await pgPool.query(
      `
      select "spacesKey" as key, "mimeType" as mime_type
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

    const isPdf =
      mimeType === "application/pdf" ||
      (key.toLowerCase().endsWith(".pdf"));
    if (!isPdf) {
      return res.status(400).json({
        ok: false,
        error: "Document is not a PDF; recognition is only supported for PDFs",
      });
    }

    const bytes = await getObjectBuffer(key);
    const text = await extractTextFromPdf(bytes);

    requestLog(req, "info", "recognize_start", { documentId, extractedTextLength: text.length });

    const result = classifyAndExtract(text);
    const classification = classify(text, key.split("/").pop() ?? "");
    let finalDocType = classification.docType !== "unknown" ? classification.docType : result.docType;
    const finalConfidence = classification.docType !== "unknown" ? classification.confidence : result.confidence;

    const [insuranceOn, courtOn] = await Promise.all([
      hasFeature(firmId, "insurance_extraction"),
      hasFeature(firmId, "court_extraction"),
    ]);
    if ((finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_")) && !insuranceOn) finalDocType = "other";
    if ((finalDocType === "court_filing" || finalDocType.startsWith("court_")) && !courtOn) finalDocType = "other";

    const baseFields: Record<string, unknown> = {
      docType: finalDocType,
      caseNumber: result.caseNumber,
      clientName: result.clientName,
      incidentDate: result.incidentDate,
      excerptLength: (result.excerpt || "").length,
    };
    const extractedFields = runExtractors(text, finalDocType, baseFields);

    const { risks } = analyzeRisks(text);
    const risksJson = risks.length > 0 ? JSON.stringify(risks) : null;

    const { insights } = analyzeDocumentInsights(text);
    const insightsJson = insights.length > 0 ? JSON.stringify(insights) : null;

    const { summary: summaryText, keyFacts } = await summarizeDocument(text);
    const summaryJson =
      summaryText || keyFacts.length > 0 ? JSON.stringify({ summary: summaryText, keyFacts }) : null;

    const insuranceFieldsJson =
      insuranceOn && (finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_"))
        ? JSON.stringify(await extractInsuranceOfferFields({ text, fileName: key.split("/").pop() ?? undefined }))
        : null;

    const courtFieldsJson =
      courtOn && (finalDocType === "court_filing" || finalDocType.startsWith("court_"))
        ? JSON.stringify(await extractCourtFields({ text, fileName: key.split("/").pop() ?? undefined }))
        : null;

    await pgPool.query(
      `
      insert into document_recognition
      (document_id,text_excerpt,doc_type,client_name,case_number,incident_date,confidence,insurance_fields,court_fields,risks,insights,summary)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        updated_at=now()
      `,
      [
        documentId,
        result.excerpt,
        finalDocType,
        result.clientName,
        result.caseNumber,
        result.incidentDate,
        finalConfidence,
        insuranceFieldsJson,
        courtFieldsJson,
        risksJson,
        insightsJson,
        summaryJson,
      ]
    );

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (doc) {
      await prisma.document.update({
        where: { id: documentId },
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
        clientName: result.clientName,
        caseNumber: result.caseNumber,
        incidentDate: result.incidentDate,
        confidence: finalConfidence,
      },
    });

    res.json({
      ok: true,
      documentId,
      docType: finalDocType,
      confidence: finalConfidence,
      caseNumber: result.caseNumber,
      clientName: result.clientName,
      incidentDate: result.incidentDate,
      excerptLength: (result.excerpt || "").length,
      excerpt: result.excerpt,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Manual reprocess: enqueue job (document.reprocess)
app.post("/documents/:id/reprocess", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { mode?: string };
    const mode = (String(body.mode ?? "full").toLowerCase() || "full") as "full" | "ocr" | "extraction";
    if (!["full", "ocr", "extraction"].includes(mode)) {
      return res.status(400).json({ ok: false, error: "mode must be full, ocr, or extraction" });
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, firmId: true, duplicateOfId: true },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }
    if (doc.duplicateOfId) {
      return res.status(400).json({ ok: false, error: "cannot reprocess a duplicate document" });
    }
    if (mode === "extraction") {
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
    }

    const job = await enqueueJobToQueue({
      firmId,
      type: "document.reprocess",
      payload: { documentId, firmId, mode },
    });
    res.json({ ok: true, jobId: job.id, status: "queued" });
  } catch (e: any) {
    logSystemError("api", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// OCR/extraction diagnostics for review UI (uncertain fields, page status, handwriting, language)
app.get("/documents/:id/recognition-diagnostics", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, extractedFields: true, confidence: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });
    const { rows } = await pgPool.query(
      `select detected_language, possible_languages, ocr_engine, ocr_confidence,
              has_handwriting, handwriting_heavy, handwriting_confidence, page_diagnostics,
              extraction_strict_mode
       from document_recognition where document_id = $1`,
      [documentId]
    );
    const rec = rows[0] || {};
    const extracted = (doc.extractedFields as Record<string, unknown>) || {};
    const uncertainFields: { field: string; reason: string; suppressedValue?: unknown }[] = [];
    for (const [k, v] of Object.entries(extracted)) {
      if (k.endsWith("_uncertain") && v === true) {
        const field = k.replace(/_uncertain$/, "");
        uncertainFields.push({
          field,
          reason: "below_confidence_threshold",
          suppressedValue: (extracted as Record<string, unknown>)[`${field}_suppressedValue`],
        });
      }
    }
    if ((extracted as Record<string, unknown>).consistencyConflicts) {
      uncertainFields.push({
        field: "consistency",
        reason: "conflicting_values_across_pages",
        suppressedValue: (extracted as Record<string, unknown>).consistencyCandidates,
      });
    }
    res.json({
      ok: true,
      diagnostics: {
        detectedLanguage: rec.detected_language ?? null,
        possibleLanguages: rec.possible_languages ?? null,
        ocrEngine: rec.ocr_engine ?? null,
        ocrConfidence: rec.ocr_confidence ?? null,
        hasHandwriting: rec.has_handwriting ?? false,
        handwritingHeavy: rec.handwriting_heavy ?? false,
        handwritingConfidence: rec.handwriting_confidence ?? null,
        pageDiagnostics: rec.page_diagnostics ?? null,
        extractionStrictMode: rec.extraction_strict_mode ?? true,
        documentConfidence: doc.confidence ?? null,
        uncertainFields,
      },
    });
  } catch (e: any) {
    logSystemError("api", e).catch(() => {});
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Re-run case matching for a document (requires existing recognition)
app.post("/documents/:id/rematch", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix ?? "api";

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }

    const { rows: recRows } = await pgPool.query(
      `select document_id, case_number, client_name from document_recognition where document_id = $1`,
      [documentId]
    );
    const rec = recRows[0];
    if (!rec) {
      return res.status(400).json({ ok: false, error: "Run recognition first" });
    }

    const signals = {
      caseNumber: rec.case_number ?? null,
      clientName: rec.client_name ?? null,
    };
    const match = await matchDocumentToCase(firmId, signals, doc.routedCaseId);

    await pgPool.query(
      `update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, updated_at = now() where document_id = $3`,
      [match.matchConfidence, match.matchReason, documentId, match.caseId]
    );

    const updateData: { status?: string; routedCaseId?: string | null } = {};
    if (match.matchConfidence > 0.9 && match.caseId) {
      updateData.status = "UPLOADED";
      updateData.routedCaseId = match.caseId;
    } else if (match.matchConfidence >= 0.5) {
      updateData.status = "NEEDS_REVIEW";
      updateData.routedCaseId = match.caseId ?? null;
    } else {
      updateData.status = "NEEDS_REVIEW";
      updateData.routedCaseId = null;
    }
    await prisma.document.update({
      where: { id: documentId },
      data: updateData as { status?: "UPLOADED" | "NEEDS_REVIEW"; routedCaseId?: string | null },
    });

    if (updateData.status === "NEEDS_REVIEW") {
      await recordReviewQueueEnter(firmId, documentId);
    } else if (updateData.status === "UPLOADED") {
      await recordReviewQueueExit(firmId, documentId, "routed");
    }

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "rematch",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: match.caseId ?? null,
      metaJson: {
        matchConfidence: match.matchConfidence,
        matchReason: match.matchReason,
        caseId: match.caseId,
      },
    });

    res.json({
      ok: true,
      documentId,
      matchConfidence: match.matchConfidence,
      matchReason: match.matchReason,
      caseId: match.caseId,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/approve", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as any;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    if (doc.routedCaseId) {
      await prisma.document.update({
        where: { id: documentId },
        data: { routingStatus: "routed", status: "UPLOADED" },
      });
      await recordReviewQueueExit(firmId, documentId, "approved");
    }

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "approved",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: doc.routedCaseId ?? null,
      metaJson: body ?? null,
    });

    if (doc.routedCaseId) {
      try {
        await rebuildCaseTimeline(doc.routedCaseId, firmId);
      } catch (e) {
        console.error("[timeline] rebuild after approve failed", { caseId: doc.routedCaseId, err: e });
      }
      pushCaseIntelligenceToCrm({
        firmId,
        caseId: doc.routedCaseId,
        actionType: "document_approved",
        documentId,
      }).catch((e) => console.warn("[crm] push after approve failed", e));
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/reject", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as any;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    await prisma.document.update({
      where: { id: documentId },
      data: { routingStatus: "rejected" },
    });
    await recordReviewQueueExit(firmId, documentId, "rejected");

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: "rejected",
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: doc.routedCaseId ?? null,
      metaJson: body ?? null,
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
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as any;
    const toCaseId = body?.caseId ? String(body.caseId) : null;

    const docBefore = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { routedCaseId: true, status: true, originalName: true, source: true },
    });
    if (!docBefore) return res.status(404).json({ ok: false, error: "document not found" });
    const { rows: recRows } = await pgPool.query<{ suggested_case_id: string | null; match_confidence: number | null; doc_type: string | null; case_number: string | null; client_name: string | null }>(
      `select suggested_case_id, match_confidence, doc_type, case_number, client_name from document_recognition where document_id = $1`,
      [documentId]
    );
    const recBefore = recRows[0];

    const result = await routeDocument(firmId, documentId, toCaseId, {
      actor,
      action: "routed",
      routedSystem: "manual",
      routingStatus: toCaseId ? "routed" : null,
      metaJson: body ?? null,
    });

    if (!result.ok) {
      return res.status(404).json({ ok: false, error: result.error });
    }

    recordRoutingFeedback(
      {
        firmId,
        documentId,
        finalCaseId: toCaseId,
        finalStatus: toCaseId ? "UPLOADED" : docBefore.status,
        finalDocType: recBefore?.doc_type ?? null,
        correctedBy: actor,
      },
      {
        caseId: docBefore.routedCaseId ?? recBefore?.suggested_case_id ?? null,
        status: docBefore.status,
        docType: recBefore?.doc_type ?? null,
        confidence: recBefore?.match_confidence != null ? Number(recBefore.match_confidence) : null,
      },
      {
        caseNumber: recBefore?.case_number ?? null,
        clientName: recBefore?.client_name ?? null,
        docType: recBefore?.doc_type ?? null,
        fileName: docBefore.originalName,
        source: docBefore.source,
      }
    ).catch((e) => logWarn("routing_feedback_after_route_failed", { documentId, firmId, error: (e as Error)?.message }));

    if (toCaseId) {
      const crmSyncEnabled = await hasFeature(firmId, "crm_sync");
      if (crmSyncEnabled) {
        try {
          const firm = await prisma.firm.findUnique({
            where: { id: firmId },
            select: { settings: true },
          });
          const settings = firm?.settings as Record<string, unknown> | null | undefined;
          if (settings?.crm === "clio") {
            const doc = await prisma.document.findFirst({
              where: { id: documentId, firmId },
              select: { spacesKey: true, originalName: true },
            });
            if (doc?.spacesKey) {
              const fileUrl = await getPresignedGetUrl(doc.spacesKey);
              const pushResult = await pushDocumentToClio({
                firmId,
                caseId: toCaseId,
                documentId,
                fileName: doc.originalName || documentId,
                fileUrl,
              });
              if (!pushResult.ok) {
                logWarn("route_clio_push_failed", { documentId, firmId, caseId: toCaseId, error: pushResult.error });
              }
            }
          }
        } catch (e) {
          logWarn("route_crm_sync_error", { documentId, firmId, caseId: toCaseId, error: (e as Error)?.message });
        }
      }
      pushCaseIntelligenceToCrm({
        firmId,
        caseId: toCaseId,
        actionType: "document_routed",
        documentId,
      }).catch((e) => logWarn("crm_push_after_route_failed", { documentId, firmId, caseId: toCaseId, error: (e as Error)?.message }));
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin correction: wrong case routing (audited as routing_corrected)
app.post("/documents/:id/correct-routing", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix || "staff";
    const body = (req.body ?? {}) as { toCaseId?: string | null };
    const toCaseId = body.toCaseId != null ? (body.toCaseId ? String(body.toCaseId) : null) : null;
    const result = await correctRouting(firmId, documentId, toCaseId, actor);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("POST /documents/:id/correct-routing failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin correction: wrong provider match (audited as provider_corrected)
app.post("/documents/:id/correct-provider", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix || "staff";
    const body = (req.body ?? {}) as { providerId?: string | null };
    const providerId = body.providerId != null ? (body.providerId ? String(body.providerId) : null) : null;
    const result = await correctProvider(firmId, documentId, providerId, actor);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("POST /documents/:id/correct-provider failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin correction: export file name / folder overrides (audited as export_name_corrected)
app.patch("/documents/:id/export-overrides", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix || "staff";
    const body = (req.body ?? {}) as { exportFileNameOverride?: string | null; exportFolderPathOverride?: string | null };
    if (body.exportFileNameOverride === undefined && body.exportFolderPathOverride === undefined) {
      return res.status(400).json({ ok: false, error: "Provide at least one of exportFileNameOverride, exportFolderPathOverride" });
    }
    const result = await setExportOverrides(firmId, documentId, body, actor);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PATCH /documents/:id/export-overrides failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/claim", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as any;
    const user = body?.user || body?.claimedBy || "unknown";

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true, status: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    // Simple idempotent semantics: if already claimed by someone else, return 409
    const existingEvents = await prisma.documentAuditEvent.findMany({
      where: { documentId, firmId, action: "claimed" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const lastClaim = existingEvents[0];
    if (lastClaim && lastClaim.actor !== user) {
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

app.get("/documents/:id/thumbnail", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { thumbnailKey: true },
    });
    if (!doc?.thumbnailKey) return res.status(404).json({ ok: false, error: "thumbnail not found" });

    const url = await getPresignedGetUrl(doc.thumbnailKey, 300);
    res.redirect(302, url);
  } catch (e: any) {
    console.error("GET /documents/:id/thumbnail failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/documents/:id/download", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

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

app.patch("/documents/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix || "reviewer";
    const body = (req.body ?? {}) as {
      status?: string;
      routedCaseId?: string | null;
      routingStatus?: string | null;
      exportFileNameOverride?: string | null;
      exportFolderPathOverride?: string | null;
      duplicateOfId?: string | null;
    };

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, status: true, routedCaseId: true, routingStatus: true, originalName: true, source: true, metaJson: true, duplicateOfId: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    if (body.routedCaseId !== undefined) {
      const toCaseId = body.routedCaseId === null || body.routedCaseId === "" ? null : String(body.routedCaseId).trim();
      if (toCaseId) {
        const caseRow = await prisma.legalCase.findFirst({ where: { id: toCaseId, firmId }, select: { id: true } });
        if (!caseRow) return res.status(404).json({ ok: false, error: "case not found" });
        const result = await routeDocument(firmId, documentId, toCaseId, {
          actor,
          action: "routed",
          routedSystem: "manual",
          routingStatus: "routed",
          metaJson: { source: "patch" },
        });
        if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
        const updated = await prisma.document.findFirst({ where: { id: documentId, firmId } });
        return res.json(updated);
      }
      await prisma.document.update({
        where: { id: documentId },
        data: { routedCaseId: null, routedSystem: null, routingStatus: null, status: "UNMATCHED" },
      });
      await recordReviewQueueExit(firmId, documentId, "unmatched");
      await addDocumentAuditEvent({
        firmId,
        documentId,
        actor,
        action: "unrouted",
        fromCaseId: doc.routedCaseId ?? null,
        toCaseId: null,
        metaJson: { source: "patch" },
      });
      const { rows: recRows } = await pgPool.query<{ suggested_case_id: string | null; match_confidence: number | null; doc_type: string | null; case_number: string | null; client_name: string | null }>(
        `select suggested_case_id, match_confidence, doc_type, case_number, client_name from document_recognition where document_id = $1`,
        [documentId]
      ).catch(() => ({ rows: [] }));
      const rec = recRows[0];
      recordRoutingFeedback(
        {
          firmId,
          documentId,
          finalCaseId: null,
          finalStatus: "UNMATCHED",
          finalDocType: rec?.doc_type ?? null,
          correctedBy: actor,
        },
        {
          caseId: doc.routedCaseId ?? rec?.suggested_case_id ?? null,
          status: doc.status,
          docType: rec?.doc_type ?? null,
          confidence: rec?.match_confidence != null ? Number(rec.match_confidence) : null,
        },
        { caseNumber: rec?.case_number ?? null, clientName: rec?.client_name ?? null, docType: rec?.doc_type ?? null, fileName: doc.originalName, source: doc.source }
      ).catch((e) => console.warn("[routing-feedback] record after unmatch failed", e));
      const updated = await prisma.document.findFirst({ where: { id: documentId, firmId } });
      return res.json(updated);
    }

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      const validStatuses = ["RECEIVED", "PROCESSING", "NEEDS_REVIEW", "UPLOADED", "FAILED", "UNMATCHED"];
      if (validStatuses.includes(String(body.status))) {
        updates.status = body.status;
      }
    }
    if (body.routingStatus !== undefined) {
      updates.routingStatus = body.routingStatus === null || body.routingStatus === "" ? null : String(body.routingStatus);
      if (updates.routingStatus === "needs_review") (updates as any).status = "NEEDS_REVIEW";
    }

    if (body.exportFileNameOverride !== undefined || body.exportFolderPathOverride !== undefined) {
      const meta = (doc.metaJson ?? {}) as Record<string, unknown>;
      if (body.exportFileNameOverride !== undefined) {
        meta.exportFileNameOverride = body.exportFileNameOverride === null || body.exportFileNameOverride === "" ? null : String(body.exportFileNameOverride).trim();
      }
      if (body.exportFolderPathOverride !== undefined) {
        meta.exportFolderPathOverride = body.exportFolderPathOverride === null || body.exportFolderPathOverride === "" ? null : String(body.exportFolderPathOverride).trim();
      }
      (updates as any).metaJson = meta;
    }

    if (body.duplicateOfId !== undefined && doc.duplicateOfId != null) {
      if (body.duplicateOfId === null || body.duplicateOfId === "") {
        (updates as any).duplicateOfId = null;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.document.update({ where: { id: documentId }, data: updates });
      const newStatus = (updates.status as string) ?? doc.status;
      if (newStatus === "NEEDS_REVIEW" && doc.status !== "NEEDS_REVIEW") {
        await recordReviewQueueEnter(firmId, documentId);
      } else if (doc.status === "NEEDS_REVIEW" && (newStatus === "UPLOADED" || newStatus === "UNMATCHED")) {
        await recordReviewQueueExit(firmId, documentId, newStatus === "UPLOADED" ? "routed" : "unmatched");
      }
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

    const updated = await prisma.document.findFirst({ where: { id: documentId, firmId } });
    res.json(updated);
  } catch (e: any) {
    console.error("Failed to patch document", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/documents/:id/preview", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

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

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, duplicateOfId: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    let normalizedText: string | null = null;
    try {
      const { rows } = await pgPool.query<{ text_excerpt: string | null }>(
        `select text_excerpt from document_recognition where document_id = $1`,
        [documentId]
      );
      normalizedText = rows[0]?.text_excerpt ?? null;
    } catch (_) {}

    const result = await findDuplicateCandidates(firmId, documentId, normalizedText);

    res.json({
      ok: true,
      original: result.original,
      duplicates: result.duplicates,
      nearDuplicates: result.nearDuplicates,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

async function getDocumentAuditEvents(req: express.Request, res: express.Response): Promise<void> {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
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

// Document tags (add/remove on a document)
app.get("/documents/:id/tags", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "Document not found" });
    const links = await prisma.documentTagLink.findMany({
      where: { documentId },
      include: { tag: { select: { id: true, name: true, color: true } } },
    });
    res.json({ ok: true, items: links.map((l) => ({ id: l.id, tagId: l.tagId, tag: l.tag })) });
  } catch (e: any) {
    console.error("GET /documents/:id/tags failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/tags", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { tagId?: string };
    const tagId = typeof body.tagId === "string" ? body.tagId.trim() : "";
    if (!tagId) {
      return res.status(400).json({ ok: false, error: "tagId is required" });
    }
    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "Document not found" });
    const tag = await prisma.documentTag.findFirst({
      where: { id: tagId, firmId },
      select: { id: true },
    });
    if (!tag) return res.status(404).json({ ok: false, error: "Tag not found" });
    await prisma.documentTagLink.upsert({
      where: { documentId_tagId: { documentId, tagId } },
      create: { documentId, tagId },
      update: {},
    });
    const links = await prisma.documentTagLink.findMany({
      where: { documentId },
      include: { tag: { select: { id: true, name: true, color: true } } },
    });
    res.status(201).json({
      ok: true,
      items: links.map((l) => ({ id: l.id, tagId: l.tagId, tag: l.tag })),
    });
  } catch (e: any) {
    console.error("POST /documents/:id/tags failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete("/documents/:id/tags/:tagId", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const tagId = String(req.params.tagId ?? "");
    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "Document not found" });
    const tag = await prisma.documentTag.findFirst({
      where: { id: tagId, firmId },
      select: { id: true },
    });
    if (!tag) return res.status(404).json({ ok: false, error: "Tag not found" });
    await prisma.documentTagLink.deleteMany({ where: { documentId, tagId } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /documents/:id/tags/:tagId failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Document version history (must be before GET /documents/:id so "versions" and "new-version" match)
app.get("/documents/:id/versions", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: "desc" },
    });

    const items = await Promise.all(
      versions.map(async (v) => {
        const url = await getPresignedGetUrl(v.spacesKey, 300);
        return {
          id: v.id,
          versionNumber: v.versionNumber,
          spacesKey: v.spacesKey,
          createdAt: v.createdAt.toISOString(),
          downloadUrl: url,
        };
      })
    );

    res.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /documents/:id/versions failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/documents/:id/new-version", auth, requireRole(Role.STAFF), upload.single("file"), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, spacesKey: true, originalName: true, mimeType: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    const file = (req as any).file;
    if (!file || !file.buffer || !Buffer.isBuffer(file.buffer)) {
      return res.status(400).json({ ok: false, error: "file is required (multipart form field: file)" });
    }
    const scan = await validateUploadFile({
      originalname: file.originalname || "document",
      mimetype: file.mimetype || "application/octet-stream",
      size: file.size ?? file.buffer.length,
      buffer: file.buffer,
    });
    if (!scan.ok) {
      logIntakeFailure({
        stage: "validation",
        error: (scan as { reason?: string }).reason ?? "Invalid file",
        code: "INVALID_FILE",
        firmId,
        fileName: file.originalname,
        sizeBytes: file.size ?? file.buffer?.length,
      });
      recordAbuse({ ip: (req as any).ip || req.socket?.remoteAddress || "unknown", route: req.path || "/documents/:id/new-version", eventType: "suspicious_upload" });
      return sendSafeError(res, 400, (scan as { reason?: string }).reason ?? "Invalid file", "INVALID_FILE");
    }

    const mimeType = file.mimetype || "application/octet-stream";
    const originalName = file.originalname || doc.originalName || "document.pdf";
    const buf = file.buffer as Buffer;

    const nextVersion = await prisma.documentVersion
      .aggregate({
        where: { documentId },
        _max: { versionNumber: true },
      })
      .then((r) => (r._max?.versionNumber ?? 0) + 1);

    if (nextVersion === 1) {
      await prisma.documentVersion.create({
        data: {
          documentId,
          versionNumber: 1,
          spacesKey: doc.spacesKey,
        },
      });
    }

    const key = `${firmId}/documents/${documentId}/versions/v${nextVersion}_${Date.now()}.pdf`;
    await putObject(key, buf, mimeType);

    const fileSha256 = crypto.createHash("sha256").update(buf).digest("hex");
    const pageCount = await countPagesFromBuffer(buf, mimeType, originalName).catch(() => 1);

    await prisma.$transaction([
      prisma.documentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersion,
          spacesKey: key,
        },
      }),
      prisma.document.update({
        where: { id: documentId },
        data: {
          spacesKey: key,
          mimeType,
          pageCount,
          fileSizeBytes: buf.length,
          file_sha256: fileSha256,
          originalName,
          status: "UPLOADED",
          processingStage: "complete",
          processedAt: new Date(),
        },
      }),
    ]);

    const version = await prisma.documentVersion.findFirst({
      where: { documentId, versionNumber: nextVersion },
    });

    res.status(201).json({
      ok: true,
      version: version
        ? {
            id: version.id,
            versionNumber: version.versionNumber,
            spacesKey: version.spacesKey,
            createdAt: version.createdAt.toISOString(),
          }
        : null,
    });
  } catch (e: any) {
    console.error("POST /documents/:id/new-version failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/documents/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "document-detail.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ ok: false, error: "Document detail page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });
    const out = { ...doc, createdAt: doc.createdAt?.toISOString?.() ?? null, processedAt: doc.processedAt?.toISOString?.() ?? null, ingestedAt: doc.ingestedAt?.toISOString?.() ?? null };
    res.json(out);
  } catch (e: any) {
    console.error("Failed to get document", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "case-detail.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ error: "Case detail page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const c = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true },
    });
    if (!c) return res.status(404).json({ error: "Case not found" });
    res.json({ ok: true, item: c });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/audit", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
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
    const firmId = (req as any).firmId as string;
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

app.get("/cases/:id/report", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const caseExists = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!caseExists) {
      return res.status(404).json({ ok: false, error: "Case not found." });
    }
    const pdfBuffer = await buildCaseReportPdf(caseId, firmId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="case-report-${caseId}.pdf"`);
    res.send(pdfBuffer);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Case summary (auto-generated narrative, persisted)
app.get("/cases/:id/summary", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const summary = await prisma.caseSummary.findUnique({
      where: { firmId_caseId: { firmId, caseId } },
      select: { id: true, body: true, createdAt: true },
    });

    if (!summary) {
      return res.json({ ok: true, summary: null });
    }

    res.json({
      ok: true,
      summary: {
        id: summary.id,
        body: summary.body,
        createdAt: summary.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("Failed to get case summary", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/summary/generate", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const result = await generateCaseSummary(caseId, firmId);

    const summary = await prisma.caseSummary.upsert({
      where: { firmId_caseId: { firmId, caseId } },
      create: { firmId, caseId, body: result.body },
      update: { body: result.body },
      select: { id: true, body: true, createdAt: true },
    });

    res.json({
      ok: true,
      summary: {
        id: summary.id,
        body: summary.body,
        createdAt: summary.createdAt.toISOString(),
      },
      conciseNarrative: result.sections.conciseNarrative,
      injuries: result.sections.injuries,
      providersInvolved: result.sections.providersInvolved,
      treatmentTimelineSummary: result.sections.treatmentTimelineSummary,
      latestOffer: result.sections.latestOffer,
    });
  } catch (e: any) {
    console.error("Failed to generate case summary", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const DEFAULT_CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "bills", label: "Bills" },
  { key: "records", label: "Records" },
  { key: "mri", label: "MRI" },
  { key: "narrative", label: "Narrative" },
  { key: "demand_letter", label: "Demand letter" },
  { key: "settlement_offer_history", label: "Settlement offer history" },
];

app.get("/cases/:id/checklist", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    let items = await prisma.caseChecklistItem.findMany({
      where: { caseId, firmId },
      orderBy: { createdAt: "asc" },
      select: { id: true, key: true, label: true, completed: true, createdAt: true, updatedAt: true },
    });

    if (items.length === 0) {
      await prisma.caseChecklistItem.createMany({
        data: DEFAULT_CHECKLIST_ITEMS.map(({ key, label }) => ({
          firmId,
          caseId,
          key,
          label,
        })),
      });
      items = await prisma.caseChecklistItem.findMany({
        where: { caseId, firmId },
        orderBy: { createdAt: "asc" },
        select: { id: true, key: true, label: true, completed: true, createdAt: true, updatedAt: true },
      });
    }

    res.json({
      ok: true,
      items: items.map((i) => ({
        id: i.id,
        key: i.key,
        label: i.label,
        completed: i.completed,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("Failed to get case checklist", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/cases/checklist-items/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const itemId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { completed?: boolean };

    const item = await prisma.caseChecklistItem.findFirst({
      where: { id: itemId, firmId },
      select: { id: true, key: true, label: true, completed: true, createdAt: true, updatedAt: true },
    });
    if (!item) return res.status(404).json({ error: "Checklist item not found" });

    const completed = body.completed === true;

    const updated = await prisma.caseChecklistItem.update({
      where: { id: itemId },
      data: { completed },
      select: { id: true, key: true, label: true, completed: true, createdAt: true, updatedAt: true },
    });

    res.json({
      ok: true,
      item: {
        id: updated.id,
        key: updated.key,
        label: updated.label,
        completed: updated.completed,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("Failed to update checklist item", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Case financial tracker
app.get("/cases/:id/financial", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const fin = await prisma.caseFinancial.findUnique({
      where: { firmId_caseId: { firmId, caseId } },
    });
    if (!fin) {
      return res.json({
        ok: true,
        item: {
          medicalBillsTotal: 0,
          liensTotal: 0,
          settlementOffer: null,
          settlementAccepted: null,
          attorneyFees: null,
          costs: null,
          netToClient: null,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    res.json({
      ok: true,
      item: {
        id: fin.id,
        medicalBillsTotal: fin.medicalBillsTotal,
        liensTotal: fin.liensTotal,
        settlementOffer: fin.settlementOffer,
        settlementAccepted: fin.settlementAccepted,
        attorneyFees: fin.attorneyFees,
        costs: fin.costs,
        netToClient: fin.netToClient,
        updatedAt: fin.updatedAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("GET /cases/:id/financial failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Queue 3: Bill line items for case (from billing extraction)
app.get("/cases/:id/bill-line-items", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

    const items = await prisma.medicalBillLineItem.findMany({
      where: { caseId, firmId },
      orderBy: [{ serviceDate: "asc" }, { createdAt: "asc" }],
    });
    res.json({
      ok: true,
      items: items.map((i: { id: string; documentId: string; providerName: string | null; serviceDate: Date | null; cptCode: string | null; procedureDescription: string | null; amountCharged: number | null; amountPaid: number | null; balance: number | null; lineTotal: number | null }) => ({
        id: i.id,
        documentId: i.documentId,
        providerName: i.providerName,
        serviceDate: i.serviceDate?.toISOString?.() ?? null,
        cptCode: i.cptCode,
        procedureDescription: i.procedureDescription,
        amountCharged: i.amountCharged,
        amountPaid: i.amountPaid,
        balance: i.balance,
        lineTotal: i.lineTotal,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/cases/:id/financial", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as {
      medicalBillsTotal?: number;
      liensTotal?: number;
      settlementOffer?: number | null;
      settlementAccepted?: number | null;
      attorneyFees?: number | null;
      costs?: number | null;
      netToClient?: number | null;
    };

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const toNum = (v: unknown): number | undefined =>
      v === null || v === undefined ? undefined : typeof v === "number" && Number.isFinite(v) ? v : undefined;

    const medicalBillsTotal = toNum(body.medicalBillsTotal);
    const liensTotal = toNum(body.liensTotal);
    const settlementOffer = body.settlementOffer === null ? null : toNum(body.settlementOffer);
    const settlementAccepted = body.settlementAccepted === null ? null : toNum(body.settlementAccepted);
    const attorneyFees = body.attorneyFees === null ? null : toNum(body.attorneyFees);
    const costs = body.costs === null ? null : toNum(body.costs);
    const netToClient = body.netToClient === null ? null : toNum(body.netToClient);

    const data: {
      medicalBillsTotal?: number;
      liensTotal?: number;
      settlementOffer?: number | null;
      settlementAccepted?: number | null;
      attorneyFees?: number | null;
      costs?: number | null;
      netToClient?: number | null;
    } = {};
    if (medicalBillsTotal !== undefined) data.medicalBillsTotal = medicalBillsTotal;
    if (liensTotal !== undefined) data.liensTotal = liensTotal;
    if (settlementOffer !== undefined) data.settlementOffer = settlementOffer;
    if (settlementAccepted !== undefined) data.settlementAccepted = settlementAccepted;
    if (attorneyFees !== undefined) data.attorneyFees = attorneyFees;
    if (costs !== undefined) data.costs = costs;
    if (netToClient !== undefined) data.netToClient = netToClient;

    // Auto-calc netToClient if settlementAccepted present and not explicitly provided
    const existing = await prisma.caseFinancial.findUnique({
      where: { firmId_caseId: { firmId, caseId } },
    });
    const merged = {
      medicalBillsTotal: existing?.medicalBillsTotal ?? 0,
      liensTotal: existing?.liensTotal ?? 0,
      settlementOffer: existing?.settlementOffer ?? null,
      settlementAccepted: existing?.settlementAccepted ?? null,
      attorneyFees: existing?.attorneyFees ?? null,
      costs: existing?.costs ?? null,
      netToClient: existing?.netToClient ?? null,
      ...data,
    };
    if (
      merged.settlementAccepted != null &&
      (netToClient === undefined || body.netToClient === undefined)
    ) {
      const fees = merged.attorneyFees ?? 0;
      const costVal = merged.costs ?? 0;
      const medical = merged.medicalBillsTotal ?? 0;
      const liens = merged.liensTotal ?? 0;
      merged.netToClient = merged.settlementAccepted - fees - costVal - medical - liens;
      data.netToClient = merged.netToClient;
    }

    const fin = await prisma.caseFinancial.upsert({
      where: { firmId_caseId: { firmId, caseId } },
      create: {
        firmId,
        caseId,
        medicalBillsTotal: merged.medicalBillsTotal,
        liensTotal: merged.liensTotal,
        settlementOffer: merged.settlementOffer,
        settlementAccepted: merged.settlementAccepted,
        attorneyFees: merged.attorneyFees,
        costs: merged.costs,
        netToClient: merged.netToClient,
      },
      update: {
        medicalBillsTotal: merged.medicalBillsTotal,
        liensTotal: merged.liensTotal,
        settlementOffer: merged.settlementOffer,
        settlementAccepted: merged.settlementAccepted,
        attorneyFees: merged.attorneyFees,
        costs: merged.costs,
        netToClient: merged.netToClient,
      },
      select: {
        id: true,
        medicalBillsTotal: true,
        liensTotal: true,
        settlementOffer: true,
        settlementAccepted: true,
        attorneyFees: true,
        costs: true,
        netToClient: true,
        updatedAt: true,
      },
    });

    res.json({
      ok: true,
      item: {
        id: fin.id,
        medicalBillsTotal: fin.medicalBillsTotal,
        liensTotal: fin.liensTotal,
        settlementOffer: fin.settlementOffer,
        settlementAccepted: fin.settlementAccepted,
        attorneyFees: fin.attorneyFees,
        costs: fin.costs,
        netToClient: fin.netToClient,
        updatedAt: fin.updatedAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("PATCH /cases/:id/financial failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Case packet export (ZIP bundle)
app.get("/cases/:id/export-packet/history", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const exports = await prisma.casePacketExport.findMany({
      where: { caseId, firmId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, packetType: true, createdAt: true },
    });

    res.json({
      ok: true,
      items: exports.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        packetType: e.packetType ?? "combined",
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("Failed to list packet exports", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/export-packet", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as {
      documentIds?: string[];
      includeTimeline?: boolean;
      includeSummary?: boolean;
      destinations?: ("download_bundle" | "cloud_folder" | "cloud_drive" | "email_packet" | "crm")[];
      packetType?: "records" | "bills" | "combined";
      emailTo?: string;
      emailSubject?: string;
      cloudPathPrefix?: string;
      cloudDrivePathPrefix?: string;
    };

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.map((id) => String(id)).filter(Boolean) : [];
    const includeTimeline = body.includeTimeline === true;
    const includeSummary = body.includeSummary === true;

    const job = await enqueueJobToQueue({
      firmId,
      type: "export.packet",
      payload: {
        caseId,
        firmId,
        documentIds,
        includeTimeline,
        includeSummary,
        destinations: body.destinations,
        packetType: body.packetType ?? "combined",
        emailTo: body.emailTo,
        emailSubject: body.emailSubject,
        cloudPathPrefix: body.cloudPathPrefix,
        cloudDrivePathPrefix: body.cloudDrivePathPrefix,
      },
    });
    res.status(202).json({ ok: true, jobId: job.id, status: "queued" });
  } catch (e: any) {
    console.error("Failed to export case packet", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/packet-exports/:id/download", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const exportId = String(req.params.id ?? "");

    const row = await prisma.casePacketExport.findFirst({
      where: { id: exportId, firmId },
      select: { storageKey: true, fileName: true },
    });
    if (!row) return res.status(404).json({ error: "Export not found" });

    const url = await getPresignedGetUrl(row.storageKey, 3600);
    res.redirect(302, url);
  } catch (e: any) {
    console.error("Failed to get packet export download", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/fetch-docket", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const allowed = await hasFeature(firmId, "court_extraction");
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "Court extraction add-on is not enabled for this firm.",
      });
    }
    const legalCase = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
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

app.post("/cases/:id/timeline/rebuild", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const caseExists = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!caseExists) {
      return res.status(404).json({ ok: false, error: "Case not found." });
    }
    const job = await enqueueJobToQueue({
      firmId,
      type: "timeline.rebuild",
      payload: { caseId, firmId },
    });
    res.status(202).json({ ok: true, jobId: job.id, status: "queued" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/timeline/export", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { format?: string };
    const formatRaw = typeof body.format === "string" ? body.format.trim().toLowerCase() : "";
    const format = formatRaw === "docx" ? "docx" : "pdf";

    const caseRow = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true, caseNumber: true, clientName: true, title: true },
    });
    if (!caseRow) {
      return res.status(404).json({ ok: false, error: "Case not found." });
    }

    const label = [caseRow.clientName, caseRow.caseNumber, caseRow.title].filter(Boolean).join(" ") || "chronology";
    const safeLabel = label.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 50) || "chronology";

    let buffer: Buffer;
    let ext: string;
    let mimeType: string;
    if (format === "docx") {
      buffer = await buildTimelineChronologyDocx(caseId, firmId);
      ext = "docx";
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      buffer = await buildTimelineChronologyPdf(caseId, firmId);
      ext = "pdf";
      mimeType = "application/pdf";
    }

    const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const key = `${firmId}/timeline_export/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
    await putObject(key, buffer, mimeType);

    const originalName = `Medical Chronology - ${safeLabel}.${ext}`;
    const doc = await prisma.document.create({
      data: {
        firmId,
        source: "timeline_export",
        spacesKey: key,
        originalName,
        mimeType,
        pageCount: 0,
        status: "UPLOADED",
        processingStage: "complete",
        file_sha256: fileSha256,
        fileSizeBytes: buffer.length,
        ingestedAt: new Date(),
        processedAt: new Date(),
        routedCaseId: caseId,
      },
    });

    res.json({ ok: true, documentId: doc.id });
  } catch (e: any) {
    console.error("POST /cases/:id/timeline/export failed", e);
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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

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

    const caseExists = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!caseExists) {
      return res.status(404).json({ ok: false, error: "Case not found." });
    }

    const result = await generateNarrative({
      caseId,
      firmId,
      type: internalType,
      tone,
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

    res.json({
      ok: true,
      text: result.text,
      warnings: result.warnings,
      usedEvents: result.usedEvents,
    });
    createNotification(
      firmId,
      "narrative_generated",
      "Narrative generated",
      `Demand narrative (${type}) was generated for this case.`,
      { caseId, narrativeType: type }
    ).catch((e) => console.warn("[notifications] narrative_generated failed", e));
    pushCaseIntelligenceToCrm({
      firmId,
      caseId,
      actionType: "narrative_generated",
      narrativeExcerpt: result.text,
    }).catch((e) => console.warn("[crm] push after narrative failed", e));
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/rebuild-timeline", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const caseExists = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!caseExists) {
      return res.status(404).json({ ok: false, error: "Case not found." });
    }
    await enqueueTimelineRebuildJob({ caseId, firmId });
    res.status(202).json({ ok: true, queued: true, message: "Timeline rebuild queued." });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/push-test", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const caseExists = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!caseExists) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }
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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { providerId?: string; relationship?: string };

    const providerId = body.providerId ? String(body.providerId) : "";
    if (!providerId) return res.status(400).json({ error: "providerId is required" });

    const rel = String(body.relationship ?? "").toLowerCase();
    const relationship = ["treating", "referral", "lien", "records_only"].includes(rel) ? rel : "treating";

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

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

    logActivity({
      firmId,
      caseId,
      providerId,
      type: "provider_attached",
      title: "Provider attached to case",
      meta: { providerName: created.provider?.name, relationship },
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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const providerId = String(req.params.providerId ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

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

// === Provider intake packet ===

app.post("/cases/:id/provider-packet", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { providerId?: string; includeDocuments?: string[] };

    const providerId = body.providerId ? String(body.providerId) : "";
    if (!providerId) return res.status(400).json({ error: "providerId is required" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const p = await prisma.provider.findFirst({ where: { id: providerId, firmId }, select: { id: true } });
    if (!p) return res.status(404).json({ error: "Provider not found" });

    const includeDocuments = Array.isArray(body.includeDocuments)
      ? body.includeDocuments.map((id) => String(id)).filter(Boolean)
      : [];

    const pdfBuffer = await buildProviderPacketPdf({
      caseId,
      firmId,
      providerId,
      includeDocuments: includeDocuments.length > 0 ? includeDocuments : undefined,
    });

    const providerRow = await prisma.provider.findFirst({
      where: { id: providerId, firmId },
      select: { name: true },
    });
    const safeName = (providerRow?.name ?? "Provider").replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 50) || "Provider";
    const originalName = `Intake Packet - ${safeName}.pdf`;

    const fileSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const key = `${firmId}/provider_packet/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.pdf`;

    await putObject(key, pdfBuffer, "application/pdf");

    const doc = await prisma.document.create({
      data: {
        firmId,
        source: "provider_packet",
        spacesKey: key,
        originalName,
        mimeType: "application/pdf",
        pageCount: 0,
        status: "UPLOADED",
        processingStage: "complete",
        file_sha256: fileSha256,
        fileSizeBytes: pdfBuffer.length,
        ingestedAt: new Date(),
        processedAt: new Date(),
        routedCaseId: caseId,
      },
    });

    res.status(201).json({
      ok: true,
      documentId: doc.id,
      item: {
        id: doc.id,
        originalName: doc.originalName,
        status: doc.status,
        createdAt: doc.createdAt,
      },
    });
  } catch (e: any) {
    console.error("Failed to generate provider packet", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case referrals ===

app.get("/cases/:id/referrals", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const referrals = await prisma.referral.findMany({
      where: { caseId, firmId },
      orderBy: { referredAt: "desc" },
      include: {
        provider: { select: { id: true, name: true, city: true, state: true, specialty: true } },
      },
    });

    res.json({
      ok: true,
      items: referrals.map((r) => ({
        id: r.id,
        caseId: r.caseId,
        providerId: r.providerId,
        referredAt: r.referredAt.toISOString(),
        status: r.status,
        notes: r.notes,
        provider: r.provider,
      })),
    });
  } catch (e: any) {
    console.error("Failed to list case referrals", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/referrals", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { providerId?: string; status?: string; notes?: string };

    const providerId = body.providerId ? String(body.providerId) : "";
    if (!providerId) return res.status(400).json({ error: "providerId is required" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const p = await prisma.provider.findFirst({ where: { id: providerId, firmId }, select: { id: true } });
    if (!p) return res.status(404).json({ error: "Provider not found" });

    const status = body.status && String(body.status).trim() ? String(body.status).trim() : "sent";
    const notes = body.notes != null ? (body.notes === "" ? null : String(body.notes)) : null;

    const created = await prisma.referral.create({
      data: { firmId, caseId, providerId, status, notes },
      include: {
        provider: { select: { id: true, name: true, city: true, state: true, specialty: true } },
      },
    });

    res.status(201).json({
      ok: true,
      item: {
        id: created.id,
        caseId: created.caseId,
        providerId: created.providerId,
        referredAt: created.referredAt.toISOString(),
        status: created.status,
        notes: created.notes,
        provider: created.provider,
      },
    });
  } catch (e: any) {
    console.error("Failed to create referral", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Records requests ===

app.post("/cases/:id/records-requests", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const {
      createRecordsRequestDraft,
    } = await import("./services/recordsRequestService");
    const input = {
      firmId,
      caseId,
      providerId: typeof body.providerId === "string" ? body.providerId : null,
      providerName: typeof body.providerName === "string" ? body.providerName.trim() || null : null,
      providerContact: body.providerContact != null ? String(body.providerContact) : null,
      patientName: typeof body.patientName === "string" ? body.patientName : null,
      patientDob: body.patientDob != null ? (typeof body.patientDob === "string" ? new Date(body.patientDob as string) : (body.patientDob as Date)) : null,
      dateOfLoss: body.dateOfLoss != null ? (typeof body.dateOfLoss === "string" ? new Date(body.dateOfLoss as string) : (body.dateOfLoss as Date)) : null,
      requestType: (body.requestType === "RECORDS" || body.requestType === "BILLS" || body.requestType === "BOTH") ? body.requestType : undefined,
      destinationType: (body.destinationType === "EMAIL" || body.destinationType === "FAX" || body.destinationType === "PORTAL" || body.destinationType === "MANUAL") ? body.destinationType : undefined,
      destinationValue: typeof body.destinationValue === "string" ? body.destinationValue : null,
      subject: typeof body.subject === "string" ? body.subject : null,
      messageBody: typeof body.messageBody === "string" ? body.messageBody : null,
      requestedDateFrom: body.requestedDateFrom != null ? (typeof body.requestedDateFrom === "string" ? new Date(body.requestedDateFrom as string) : (body.requestedDateFrom as Date)) : null,
      requestedDateTo: body.requestedDateTo != null ? (typeof body.requestedDateTo === "string" ? new Date(body.requestedDateTo as string) : (body.requestedDateTo as Date)) : null,
      createdByUserId: (req as any).userId ?? null,
    };
    const result = await createRecordsRequestDraft(input);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    const request = await prisma.recordsRequest.findFirst({
      where: { id: result.id, firmId },
      include: { attachments: true, events: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    logActivity({
      firmId,
      caseId,
      providerId: request?.providerId ?? null,
      type: "records_request_created",
      title: "Records request created",
      meta: { providerName: request?.providerName, recordsRequestId: result.id },
    });
    return res.status(201).json({ ok: true, item: request });
  } catch (e: any) {
    console.error("Failed to create records request", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/cases/:id/records-requests", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const items = await prisma.recordsRequest.findMany({
      where: { firmId, caseId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, items });
  } catch (e: any) {
    console.error("Failed to list records requests", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Case offers (settlement offers aggregated over time) ===

app.get("/cases/:id/offers", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const { rows } = await pgPool.query<{
      document_id: string;
      original_name: string;
      created_at: Date;
      processed_at: Date | null;
      amount: number;
    }>(
      `select d.id as document_id, d.original_name, d.created_at, d.processed_at,
              (dr.insurance_fields->>'settlementOffer')::float as amount
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d.firm_id = $1 and d.routed_case_id = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d.processed_at, d.created_at) desc`,
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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
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
      `select d.id as document_id, d.original_name, d.created_at, d.processed_at,
              (dr.insurance_fields->>'settlementOffer')::float as amount
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d.firm_id = $1 and d.routed_case_id = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d.processed_at, d.created_at) desc`,
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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : null;
    if (qFirmId && qFirmId !== firmId) {
      return res.status(403).json({ ok: false, error: "firmId mismatch" });
    }

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const items = await prisma.document.findMany({
      where: { firmId, routedCaseId: caseId },
      select: {
        id: true,
        originalName: true,
        status: true,
        createdAt: true,
        pageCount: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const docIds = items.map((d) => d.id);
    const tagLinks =
      docIds.length > 0
        ? await prisma.documentTagLink.findMany({
            where: { documentId: { in: docIds } },
            include: { tag: { select: { id: true, name: true, color: true } } },
          })
        : [];
    const tagsByDoc = new Map<string, { id: string; name: string; color: string | null }[]>();
    for (const l of tagLinks) {
      const list = tagsByDoc.get(l.documentId) || [];
      list.push({ id: l.tag.id, name: l.tag.name, color: l.tag.color });
      tagsByDoc.set(l.documentId, list);
    }

    const includeProvider = req.query.includeProvider === "true" || req.query.includeProvider === "1";
    let providerByDoc = new Map<string, { provider: string | null; eventDate: string | null }>();
    if (includeProvider && docIds.length > 0) {
      const events = await prisma.caseTimelineEvent.findMany({
        where: { caseId, firmId, documentId: { in: docIds } },
        select: { documentId: true, provider: true, eventDate: true },
      });
      for (const e of events) {
        if (!providerByDoc.has(e.documentId))
          providerByDoc.set(e.documentId, { provider: e.provider, eventDate: e.eventDate?.toISOString() ?? null });
      }
    }

    res.json({
      ok: true,
      items: items.map((d) => {
        const base: Record<string, unknown> = {
          id: d.id,
          originalName: d.originalName,
          status: d.status,
          createdAt: d.createdAt,
          pageCount: d.pageCount,
          tags: tagsByDoc.get(d.id) || [],
        };
        if (includeProvider) {
          const prov = providerByDoc.get(d.id);
          base.providerName = prov?.provider ?? null;
          base.timelineEventDate = prov?.eventDate ?? null;
        }
        return base;
      }),
    });
  } catch (e: any) {
    console.error("Failed to list case documents", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/documents/attach", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const actor = (req as any).apiKeyPrefix || "user";
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { firmId?: string; documentId?: string };

    const documentId = body.documentId ? String(body.documentId) : "";
    if (!documentId) return res.status(400).json({ error: "documentId is required" });
    if (body.firmId && body.firmId !== firmId) {
      return res.status(403).json({ ok: false, error: "firmId mismatch" });
    }

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

    const result = await routeDocument(firmId, documentId, caseId, {
      actor,
      action: "attached_to_case",
      routedSystem: "manual",
      routingStatus: "routed",
    });
    if (!result.ok) return res.status(404).json({ ok: false, error: result.error });

    logActivity({
      firmId,
      caseId,
      documentId,
      type: "document_routed",
      title: "Document attached to case",
      meta: {},
    });

    const updated = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, originalName: true, status: true, createdAt: true, pageCount: true },
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Not found" });

    res.status(201).json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("Failed to attach document to case", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/documents/upload", auth, requireRole(Role.STAFF), upload.single("file"), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const actor = (req as any).apiKeyPrefix || "user";
    const caseId = String(req.params.id ?? "");
    const file = req.file;

    if (!file) return res.status(400).json({ ok: false, error: "Missing file (multipart field name must be 'file')" });

    const scan = await validateUploadFile({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    if (!scan.ok) {
      logIntakeFailure({
        stage: "validation",
        error: (scan as { reason?: string }).reason ?? "Invalid file",
        code: "INVALID_FILE",
        firmId,
        fileName: file.originalname,
        sizeBytes: file.size,
      });
      recordAbuse({ ip: (req as any).ip || req.socket?.remoteAddress || "unknown", route: req.path || "/cases/:id/export-packet", eventType: "suspicious_upload" });
      return sendSafeError(res, 400, (scan as { reason?: string }).reason ?? "Invalid file", "INVALID_FILE");
    }

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
    });
    if (!firm) return res.status(404).json({ ok: false, error: "Firm not found" });

    const now = new Date();
    const isActive = firm.billingStatus === "active";
    const inTrial = firm.billingStatus === "trial" && (!firm.trialEndsAt || firm.trialEndsAt > now);
    if (!isActive && !inTrial) {
      return res.status(402).json({
        ok: false,
        error: "Billing required. Trial expired or inactive.",
        billingStatus: firm.billingStatus,
      });
    }

    const docLimitCheck = await canIngestDocument(firmId);
    if (!docLimitCheck.allowed) {
      return res.status(402).json({
        ok: false,
        error: docLimitCheck.error,
        docsProcessed: docLimitCheck.currentDocs,
        documentLimitMonthly: docLimitCheck.limit,
      });
    }

    const fileSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const fileSizeBytes = file.buffer.length;
    const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
    const key = `${firmId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;

    await putObject(key, file.buffer, file.mimetype || "application/octet-stream");

    const doc = await prisma.document.create({
      data: {
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

    await addDocumentAuditEvent({
      firmId,
      documentId: doc.id,
      actor,
      action: "uploaded_to_case",
      fromCaseId: null,
      toCaseId: caseId,
      metaJson: { caseId, source: "case_upload" },
    });

    logActivity({
      firmId,
      caseId,
      documentId: doc.id,
      type: "document_uploaded",
      title: "Document uploaded",
      meta: { documentName: doc.originalName },
    });

    try {
      await enqueueDocumentJob({ documentId: doc.id, firmId });
      await enqueueTimelineRebuildJob({ caseId, firmId });
    } catch (e: unknown) {
      const errMsg = (e as Error)?.message ?? "Failed to enqueue processing";
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: "FAILED", failureStage: "ingest", failureReason: errMsg.slice(0, 2000) },
      });
      res.status(500).json({ ok: false, error: errMsg });
      return;
    }

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
    });
  } catch (e: any) {
    console.error("Failed to upload document to case", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/documents", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { documentId?: string };

    const documentId = body.documentId ? String(body.documentId) : "";
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const result = await routeDocument(firmId, documentId, caseId, {
      actor: (req as any).apiKeyPrefix || "user",
      action: "attached_to_case",
      routedSystem: "manual",
      routingStatus: "routed",
    });
    if (!result.ok) return res.status(404).json({ ok: false, error: result.error });

    const updated = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, originalName: true, status: true, createdAt: true, pageCount: true },
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Not found" });

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
      select: { id: true, caseId: true, title: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: "Task not found" });

    const updated = await prisma.caseTask.update({
      where: { id: taskId },
      data: { completedAt: body.completed ? new Date() : null, updatedAt: new Date() },
    });

    if (body.completed && existing.caseId) {
      logActivity({
        firmId,
        caseId: existing.caseId,
        type: "task_completed",
        title: "Task completed",
        meta: { taskId, taskTitle: existing.title },
      });
    }

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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : firmId;
    if (qFirmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { firmId?: string; body?: string; authorUserId?: string };

    const noteBody = body.body != null ? String(body.body) : "";
    if (!noteBody.trim()) return res.status(400).json({ ok: false, error: "body is required" });
    if (body.firmId && body.firmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : firmId;
    if (qFirmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

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
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { firmId?: string; title?: string; dueDate?: string };

    const title = body.title != null ? String(body.title).trim() : "";
    if (!title) return res.status(400).json({ ok: false, error: "title is required" });
    if (body.firmId && body.firmId !== firmId) return res.status(403).json({ ok: false, error: "firmId mismatch" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

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

// === Case contacts ===
app.get("/cases/:id/contacts", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

    const items = await prisma.caseContact.findMany({
      where: { caseId, firmId },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ok: true,
      items: items.map((x) => ({
        id: x.id,
        name: x.name,
        role: x.role,
        phone: x.phone ?? null,
        email: x.email ?? null,
        notes: x.notes ?? null,
        createdAt: x.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("GET /cases/:id/contacts failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/contacts", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { name?: string; role?: string; phone?: string; email?: string; notes?: string };

    const name = body.name != null ? String(body.name).trim() : "";
    const role = body.role != null ? String(body.role).trim() : "";
    if (!name) return res.status(400).json({ ok: false, error: "name is required" });
    if (!role) return res.status(400).json({ ok: false, error: "role is required" });

    const c = await prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });

    const created = await prisma.caseContact.create({
      data: {
        caseId,
        firmId,
        name,
        role,
        phone: body.phone != null ? String(body.phone).trim() || null : null,
        email: body.email != null ? String(body.email).trim() || null : null,
        notes: body.notes != null ? String(body.notes).trim() || null : null,
      },
    });

    res.status(201).json({
      ok: true,
      item: {
        id: created.id,
        name: created.name,
        role: created.role,
        phone: created.phone ?? null,
        email: created.email ?? null,
        notes: created.notes ?? null,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error("POST /cases/:id/contacts failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/case-contacts/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const contactId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { name?: string; role?: string; phone?: string; email?: string; notes?: string };

    const existing = await prisma.caseContact.findFirst({
      where: { id: contactId, firmId },
    });
    if (!existing) return res.status(404).json({ ok: false, error: "Contact not found" });

    const data: { name?: string; role?: string; phone?: string | null; email?: string | null; notes?: string | null } = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.role !== undefined) data.role = String(body.role).trim();
    if (body.phone !== undefined) data.phone = body.phone === "" || body.phone == null ? null : String(body.phone).trim();
    if (body.email !== undefined) data.email = body.email === "" || body.email == null ? null : String(body.email).trim();
    if (body.notes !== undefined) data.notes = body.notes === "" || body.notes == null ? null : String(body.notes).trim();

    if (data.name !== undefined && !data.name) return res.status(400).json({ ok: false, error: "name cannot be empty" });
    if (data.role !== undefined && !data.role) return res.status(400).json({ ok: false, error: "role cannot be empty" });

    const updated = await prisma.caseContact.update({
      where: { id: contactId },
      data,
    });

    res.json({
      ok: true,
      item: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        phone: updated.phone ?? null,
        email: updated.email ?? null,
        notes: updated.notes ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ ok: false, error: "Contact not found" });
    console.error("PATCH /case-contacts/:id failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete("/case-contacts/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const contactId = String(req.params.id ?? "");

    const existing = await prisma.caseContact.findFirst({
      where: { id: contactId, firmId },
    });
    if (!existing) return res.status(404).json({ ok: false, error: "Contact not found" });

    await prisma.caseContact.delete({ where: { id: contactId } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ ok: false, error: "Contact not found" });
    console.error("DELETE /case-contacts/:id failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Demand packages (case-scoped)
app.get("/cases/:id/demand-packages", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "demand-packages.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ ok: false, error: "Demand packages page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const c = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });
    const list = await prisma.demandPackage.findMany({
      where: { caseId, firmId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, status: true, generatedDocId: true, generatedAt: true, createdAt: true, updatedAt: true },
    });
    res.json({ ok: true, items: list });
  } catch (e: any) {
    console.error("GET /cases/:id/demand-packages failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/cases/:id/demand-packages", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { title?: string };
    const c = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true },
    });
    if (!c) return res.status(404).json({ ok: false, error: "Case not found" });
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Demand Package";
    const pkg = await prisma.demandPackage.create({
      data: { firmId, caseId, title, status: "draft" },
    });
    res.status(201).json({ ok: true, item: pkg });
  } catch (e: any) {
    console.error("POST /cases/:id/demand-packages failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Demand package by id (package-scoped)
app.get("/demand-packages/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "demand-package-detail.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ ok: false, error: "Demand package page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const pkg = await prisma.demandPackage.findFirst({
      where: { id, firmId },
      include: { sectionSources: true },
    });
    if (!pkg) return res.status(404).json({ ok: false, error: "Demand package not found" });
    res.json({
      ok: true,
      item: {
        ...pkg,
        sectionSources: pkg.sectionSources,
      },
    });
  } catch (e: any) {
    console.error("GET /demand-packages/:id failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/demand-packages/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as {
      title?: string;
      summaryText?: string | null;
      damagesText?: string | null;
      liabilityText?: string | null;
      treatmentText?: string | null;
      futureCareText?: string | null;
      settlementText?: string | null;
      status?: string;
    };
    const existing = await prisma.demandPackage.findFirst({
      where: { id, firmId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: "Demand package not found" });
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.summaryText !== undefined) data.summaryText = body.summaryText === null || body.summaryText === "" ? null : String(body.summaryText);
    if (body.damagesText !== undefined) data.damagesText = body.damagesText === null || body.damagesText === "" ? null : String(body.damagesText);
    if (body.liabilityText !== undefined) data.liabilityText = body.liabilityText === null || body.liabilityText === "" ? null : String(body.liabilityText);
    if (body.treatmentText !== undefined) data.treatmentText = body.treatmentText === null || body.treatmentText === "" ? null : String(body.treatmentText);
    if (body.futureCareText !== undefined) data.futureCareText = body.futureCareText === null || body.futureCareText === "" ? null : String(body.futureCareText);
    if (body.settlementText !== undefined) data.settlementText = body.settlementText === null || body.settlementText === "" ? null : String(body.settlementText);
    if (body.status !== undefined && ["draft", "generating", "ready", "failed"].includes(String(body.status))) data.status = body.status;
    const updated = await prisma.demandPackage.update({
      where: { id },
      data: data as any,
    });
    res.json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("PATCH /demand-packages/:id failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/demand-packages/:id/generate", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const pkg = await prisma.demandPackage.findFirst({
      where: { id, firmId },
      select: { id: true },
    });
    if (!pkg) return res.status(404).json({ ok: false, error: "Demand package not found" });
    const job = await enqueueJobToQueue({
      firmId,
      type: "demand_package.generate",
      payload: { demandPackageId: id, firmId },
    });
    res.status(202).json({ ok: true, jobId: job.id, status: "queued" });
  } catch (e: any) {
    console.error("POST /demand-packages/:id/generate failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/demand-packages/:id/regenerate-pdf", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const pkg = await prisma.demandPackage.findFirst({
      where: { id, firmId },
      include: { case: { select: { clientName: true, caseNumber: true, title: true } } },
    });
    if (!pkg) return res.status(404).json({ ok: false, error: "Demand package not found" });
    const caseLabel = [pkg.case.clientName, pkg.case.caseNumber, pkg.case.title].filter(Boolean).join(" · ") || "Case";
    const caseDocs = await prisma.document.findMany({
      where: { firmId, routedCaseId: pkg.caseId },
      select: { originalName: true },
    });
    const { buildDemandPackagePdf } = await import("../services/demandPackagePdf");
    const pdfBuffer = await buildDemandPackagePdf({
      title: pkg.title,
      caseLabel,
      generatedDate: new Date(),
      summaryText: pkg.summaryText,
      liabilityText: pkg.liabilityText,
      treatmentText: pkg.treatmentText,
      damagesText: pkg.damagesText,
      futureCareText: pkg.futureCareText,
      settlementText: pkg.settlementText,
      appendixDocuments: caseDocs.map((d) => ({ name: d.originalName || "" })),
    });
    const key = `${firmId}/demand_packages/${id}_${Date.now()}.pdf`;
    await putObject(key, pdfBuffer, "application/pdf");
    const fileSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const doc = await prisma.document.create({
      data: {
        firmId,
        source: "demand_package",
        spacesKey: key,
        originalName: `${pkg.title.replace(/[^\w\s-]/g, "")}-demand-package.pdf`,
        mimeType: "application/pdf",
        pageCount: 0,
        status: "UPLOADED",
        processingStage: "complete",
        file_sha256: fileSha256,
        fileSizeBytes: pdfBuffer.length,
        processedAt: new Date(),
        routedCaseId: pkg.caseId,
      },
    });
    await prisma.demandPackage.update({
      where: { id },
      data: { generatedDocId: doc.id, generatedAt: new Date(), status: "ready" },
    });
    res.json({ ok: true, documentId: doc.id });
  } catch (e: any) {
    console.error("POST /demand-packages/:id/regenerate-pdf failed", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/records-requests/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  if (req.accepts("html")) {
    const p = path.join(__dirname, "..", "..", "public", "admin", "records-request-detail.html");
    return res.sendFile(p, (err) => {
      if (err) res.status(404).json({ ok: false, error: "Records request page not found" });
    });
  }
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");

    const item = await prisma.recordsRequest.findFirst({
      where: { id, firmId },
    });
    if (!item) {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }

    const caseRow = await prisma.legalCase.findUnique({
      where: { id: item.caseId },
      select: { id: true, title: true, caseNumber: true, clientName: true },
    });

    res.json({
      ok: true,
      item: {
        ...item,
        dateFrom: item.dateFrom?.toISOString() ?? null,
        dateTo: item.dateTo?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
      case: caseRow,
    });
  } catch (e: any) {
    console.error("Failed to get records request", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/records-requests/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as any;

    const existing = await prisma.recordsRequest.findFirst({
      where: { id, firmId },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }

    const data: any = {};
    if (body.status) data.status = String(body.status);
    if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes);
    if (body.dateFrom !== undefined) data.dateFrom = body.dateFrom ? new Date(body.dateFrom) : null;
    if (body.dateTo !== undefined) data.dateTo = body.dateTo ? new Date(body.dateTo) : null;
    if (body.letterBody !== undefined) data.letterBody = body.letterBody === null ? null : String(body.letterBody);

    const updated = await prisma.recordsRequest.update({
      where: { id },
      data,
    });

    res.json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("Failed to update records request", e);
    if ((e as any)?.code === "P2025") {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/records-requests/:id/generate-pdf", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");

    const reqRow = await prisma.recordsRequest.findFirst({
      where: { id, firmId },
    });
    if (!reqRow) {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }

    const letterBody = reqRow.letterBody ?? "";
    if (!letterBody.trim()) {
      return res.status(400).json({ ok: false, error: "Letter body is empty; save the letter first" });
    }

    const [firm, caseRow, provider] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } }),
      prisma.legalCase.findUnique({
        where: { id: reqRow.caseId },
        select: { title: true, caseNumber: true, clientName: true },
      }),
      reqRow.providerId
        ? prisma.provider.findFirst({
            where: { id: reqRow.providerId, firmId },
            select: { name: true, address: true, city: true, state: true, phone: true, fax: true, email: true },
          })
        : Promise.resolve(null),
    ]);

    const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-US") : "");
    const providerAddress = provider
      ? [provider.address, [provider.city, provider.state].filter(Boolean).join(", ")].filter(Boolean).join("\n")
      : null;

    const pdfBuffer = await buildRecordsRequestLetterPdf({
      letterBody,
      providerName: reqRow.providerName,
      providerContact: reqRow.providerContact,
      firmName: firm?.name ?? null,
      providerAddress: providerAddress || null,
      caseTitle: caseRow?.title ?? null,
      caseNumber: caseRow?.caseNumber ?? null,
      clientName: caseRow?.clientName ?? null,
      dateFrom: fmtDate(reqRow.dateFrom),
      dateTo: fmtDate(reqRow.dateTo),
      notes: reqRow.notes ?? null,
    });

    const safeName = reqRow.providerName.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Records Request";
    const originalName = `Records Request - ${safeName}.pdf`;

    const fileSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const key = `${firmId}/records_request/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.pdf`;

    await putObject(key, pdfBuffer, "application/pdf");

    const doc = await prisma.document.create({
      data: {
        firmId,
        source: "records_request",
        spacesKey: key,
        originalName,
        mimeType: "application/pdf",
        pageCount: 0,
        status: "UPLOADED",
        processingStage: "complete",
        file_sha256: fileSha256,
        fileSizeBytes: pdfBuffer.length,
        ingestedAt: new Date(),
        processedAt: new Date(),
        routedCaseId: reqRow.caseId,
      },
    });

    await prisma.recordsRequest.update({
      where: { id },
      data: { generatedDocumentId: doc.id },
    });

    createNotification(
      firmId,
      "records_request_pdf_generated",
      "Records request PDF generated",
      `Records request letter for ${reqRow.providerName} was saved as a document.`,
      { caseId: reqRow.caseId, documentId: doc.id, recordsRequestId: id }
    ).catch((e) => console.warn("[notifications] records_request_pdf_generated failed", e));

    res.json({ ok: true, documentId: doc.id });
  } catch (e: any) {
    console.error("Failed to generate records request PDF", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/records-requests/:id/letter", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const formatPdf =
      (req.query as any).format === "pdf" ||
      /application\/pdf/i.test(String((req as any).headers?.accept ?? ""));

    const reqRow = await prisma.recordsRequest.findFirst({
      where: { id, firmId },
    });
    if (!reqRow) {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }

    const today = new Date();
    const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-US") : "");
    const dateFromStr = reqRow.dateFrom ? fmt(reqRow.dateFrom) : "";
    const dateToStr = reqRow.dateTo ? fmt(reqRow.dateTo) : "";
    const rangeStr =
      dateFromStr && dateToStr
        ? `${dateFromStr} – ${dateToStr}`
        : dateFromStr
          ? `from ${dateFromStr}`
          : dateToStr
            ? `through ${dateToStr}`
            : "for all dates of service on file";
    const notes = reqRow.notes ? reqRow.notes : "";
    const providerContact = reqRow.providerContact ?? "";

    const templateText = [
      today.toLocaleDateString("en-US"),
      "",
      reqRow.providerName,
      providerContact,
      "",
      "Re: Request for updated medical records and billing",
      "",
      `Please provide complete and legible copies of all medical records and itemized billing ${rangeStr} for the above-referenced matter.`,
      "",
      notes ? `Additional details:\n${notes}\n` : "",
      "You may send the records electronically or via fax to our office.",
      "",
      "Thank you for your prompt attention to this request.",
    ]
      .join("\n")
      .trim();

    const text = reqRow.letterBody ?? templateText;
    const html = reqRow.letterBody
      ? `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(reqRow.letterBody)}</pre>`
      : `<p>${today.toLocaleDateString("en-US")}</p><p>${reqRow.providerName}<br/>${(providerContact || "").replace(/\n/g, "<br/>")}</p><p><strong>Re: Request for updated medical records and billing</strong></p><p>Please provide complete and legible copies of all medical records and itemized billing ${rangeStr} for the above-referenced matter.</p>${notes ? `<p><strong>Additional details:</strong><br/>${notes.replace(/\n/g, "<br/>")}</p>` : ""}<p>You may send the records electronically or via fax to our office.</p><p>Thank you for your prompt attention to this request.</p>`;

    if (formatPdf) {
      const pdfBuffer = await buildRecordsRequestLetterPdf({
        letterBody: text,
        providerName: reqRow.providerName,
        providerContact: reqRow.providerContact,
      });
      const filename = `records-request-${reqRow.providerName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
      return;
    }

    res.json({ ok: true, text, html, request: reqRow });
  } catch (e: any) {
    console.error("Failed to generate records request letter", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/records-requests/:id/send", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as { channel?: string; destination?: string; to?: string };
    const channel = String(body.channel ?? "").toLowerCase();
    const destination = String(body.destination ?? body.to ?? "").trim();

    if (!["email", "fax"].includes(channel)) {
      return res.status(400).json({ ok: false, error: "channel must be email or fax" });
    }
    if (!destination) {
      return res.status(400).json({
        ok: false,
        error: channel === "email" ? "destination (email address) is required" : "destination (fax number) is required",
      });
    }

    const reqRow = await prisma.recordsRequest.findFirst({
      where: { id, firmId },
      select: { id: true, letterBody: true },
    });
    if (!reqRow) {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }
    if (!(reqRow.letterBody ?? "").trim()) {
      return res.status(400).json({ ok: false, error: "Letter body is empty; save the letter first" });
    }

    const job = await enqueueJobToQueue({
      firmId,
      type: "records_request.send",
      payload: { recordsRequestId: id, firmId, channel, destination },
    });
    res.status(202).json({ ok: true, jobId: job.id, status: "queued" });
  } catch (e: any) {
    console.error("Failed to send records request", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/records-requests/:id/attempts", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");

    const reqRow = await prisma.recordsRequest.findFirst({
      where: { id, firmId },
      select: { id: true },
    });
    if (!reqRow) {
      return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
    }

    const items = await prisma.recordsRequestAttempt.findMany({
      where: { firmId, recordsRequestId: id },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ok: true,
      items: items.map((a) => ({
        id: a.id,
        channel: a.channel,
        destination: a.destination,
        ok: a.ok,
        error: a.error,
        externalId: a.externalId,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("Failed to list records request attempts", e);
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
      where: { firmId, status: "NEEDS_REVIEW" },
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

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, originalName: true, status: true, routedCaseId: true, routingStatus: true, mimeType: true, confidence: true, extractedFields: true, duplicateMatchCount: true, duplicateOfId: true, pageCount: true, ingestedAt: true, metaJson: true, failureStage: true, failureReason: true, processingStage: true },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }

    const { rows } = await pgPool.query(
      `select document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, match_confidence, match_reason, unmatched_reason, suggested_case_id, classification_reason, classification_signals_json, classification_status, suggested_doc_type, facility_name,
              risks, insights, insurance_fields, court_fields, updated_at,
              page_texts_json, extracted_json, quality_score, issues_json, page_count_detected, provider_name, provider_name_normalized, provider_resolution_status,
              detected_language, possible_languages, ocr_engine, ocr_confidence, has_handwriting, handwriting_heavy, handwriting_confidence, page_diagnostics, extraction_strict_mode
       from document_recognition where document_id = $1`,
      [documentId]
    );
    const rec = rows[0] || null;

    const meta = doc.metaJson && typeof doc.metaJson === "object" ? (doc.metaJson as Record<string, unknown>) : null;
    const pipelineError = meta?.pipelineError != null ? String(meta.pipelineError) : null;
    const pipelineStageMeta = meta?.pipelineStage != null ? String(meta.pipelineStage) : null;
    const failureStage = doc.failureStage ?? pipelineStageMeta;
    const failureReason = doc.failureReason ?? pipelineError;
    const providerCandidate = meta?.providerCandidate && typeof meta.providerCandidate === "object" ? meta.providerCandidate : null;

    res.json({
      ok: true,
      document: {
        id: doc.id,
        originalName: doc.originalName,
        status: doc.status,
        routedCaseId: doc.routedCaseId ?? null,
        routingStatus: doc.routingStatus ?? null,
        mimeType: doc.mimeType ?? null,
        confidence: doc.confidence,
        extractedFields: doc.extractedFields,
        lastRunAt: rec?.updated_at ?? null,
        errors: doc.status === "FAILED" ? (failureReason || "Document processing failed") : null,
        pipelineStage: doc.status === "FAILED" ? failureStage : null,
        failureStage: doc.status === "FAILED" ? failureStage : null,
        failureReason: doc.status === "FAILED" ? failureReason : null,
        processingStage: doc.processingStage ?? null,
        duplicateMatchCount: doc.duplicateMatchCount ?? 0,
        duplicateOfId: doc.duplicateOfId ?? null,
        pageCount: doc.pageCount ?? 0,
        ingestedAt: doc.ingestedAt?.toISOString?.() ?? null,
        metaJson: doc.metaJson ?? null,
        providerCandidate: providerCandidate ?? undefined,
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
            unmatchedReason: rec.unmatched_reason ?? null,
            suggestedCaseId: rec.suggested_case_id ?? null,
            classificationReason: rec.classification_reason ?? null,
            classificationSignals: rec.classification_signals_json ?? null,
            classificationStatus: rec.classification_status ?? null,
            suggestedDocType: rec.suggested_doc_type ?? null,
            facilityName: rec.facility_name ?? null,
            risks: rec.risks != null ? (Array.isArray(rec.risks) ? rec.risks : (rec.risks as any)?.risks ?? []) : [],
            insights: rec.insights != null ? (Array.isArray(rec.insights) ? rec.insights : (rec.insights as any)?.insights ?? []) : [],
            insuranceFields: rec.insurance_fields ?? null,
            courtFields: rec.court_fields ?? null,
            pageTextsJson: rec.page_texts_json ?? null,
            extractedJson: rec.extracted_json ?? null,
            qualityScore: rec.quality_score != null ? Number(rec.quality_score) : null,
            issuesJson: rec.issues_json ?? null,
            pageCountDetected: rec.page_count_detected ?? null,
            providerName: rec.provider_name ?? null,
            providerNameNormalized: rec.provider_name_normalized ?? null,
            providerResolutionStatus: rec.provider_resolution_status ?? null,
            detectedLanguage: rec.detected_language ?? null,
            possibleLanguages: rec.possible_languages ?? null,
            ocrEngine: rec.ocr_engine ?? null,
            ocrConfidence: rec.ocr_confidence != null ? Number(rec.ocr_confidence) : null,
            hasHandwriting: rec.has_handwriting ?? null,
            handwritingHeavy: rec.handwriting_heavy ?? null,
            handwritingConfidence: rec.handwriting_confidence != null ? Number(rec.handwriting_confidence) : null,
            pageDiagnostics: rec.page_diagnostics ?? null,
            extractionStrictMode: rec.extraction_strict_mode ?? null,
          }
        : null,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Update recognition (manual correction): doc_type, provider_name, client_name, case_number
app.patch("/documents/:id/recognition", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    const body = (req.body ?? {}) as { docType?: string; providerName?: string; clientName?: string; caseNumber?: string; incidentDate?: string };
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (body.docType !== undefined) {
      updates.push(`doc_type = $${idx++}`);
      values.push(String(body.docType).trim() || null);
    }
    if (body.providerName !== undefined) {
      const raw = typeof body.providerName === "string" ? body.providerName.trim() || null : null;
      updates.push(`provider_name = $${idx++}`);
      values.push(raw);
      if (raw) {
        const resolution = await resolveProvider(firmId, raw);
        updates.push(`provider_name_normalized = $${idx++}`);
        values.push(resolution.normalizedName || null);
        updates.push(`provider_resolution_status = $${idx++}`);
        values.push(resolution.resolved ? "resolved" : "unresolved");
        updates.push(`suggested_provider_id = $${idx++}`);
        values.push(resolution.resolved ? resolution.providerId : null);
      } else {
        updates.push(`provider_name_normalized = $${idx++}`);
        values.push(null);
        updates.push(`provider_resolution_status = $${idx++}`);
        values.push(null);
        updates.push(`suggested_provider_id = $${idx++}`);
        values.push(null);
      }
    }
    if (body.clientName !== undefined) {
      updates.push(`client_name = $${idx++}`);
      values.push(typeof body.clientName === "string" ? body.clientName.trim() || null : null);
    }
    if (body.caseNumber !== undefined) {
      updates.push(`case_number = $${idx++}`);
      values.push(typeof body.caseNumber === "string" ? body.caseNumber.trim() || null : null);
    }
    if (body.incidentDate !== undefined) {
      const v = typeof body.incidentDate === "string" ? body.incidentDate.trim() || null : null;
      updates.push(`incident_date = $${idx++}`);
      values.push(v);
    }
    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: "Provide at least one of docType, providerName, clientName, caseNumber, incidentDate" });
    }
    const correctedFields = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined) as string[];
    updates.push("updated_at = now()");
    values.push(documentId);
    await pgPool.query(
      `update document_recognition set ${updates.join(", ")} where document_id = $${idx}`,
      values
    );
    const actor = (req as any).apiKeyPrefix || "staff";
    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor,
      action: AUDIT_ACTIONS.RECOGNITION_CORRECTED,
      metaJson: { correction: true, fields: correctedFields },
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Export/filing preview: final file name and folder path for this document (used by naming rules + overrides).
app.get("/documents/:id/export-preview", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, originalName: true, routedCaseId: true, metaJson: true, extractedFields: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    const meta = (doc.metaJson ?? {}) as Record<string, unknown>;
    const exportFileNameOverride = meta.exportFileNameOverride != null ? String(meta.exportFileNameOverride).trim() || null : null;
    const exportFolderPathOverride = meta.exportFolderPathOverride != null ? String(meta.exportFolderPathOverride).trim() || null : null;

    if (!doc.routedCaseId) {
      return res.json({
        ok: true,
        needsRouting: true,
        message: "Assign a case to this document to see export file name and folder.",
        fileName: null,
        folderPath: null,
        context: null,
      });
    }

    const legalCase = await prisma.legalCase.findFirst({
      where: { id: doc.routedCaseId, firmId },
      select: { caseNumber: true, clientName: true, title: true },
    });
    if (!legalCase) {
      return res.json({
        ok: true,
        needsRouting: true,
        message: "Case not found.",
        fileName: null,
        folderPath: null,
        context: null,
      });
    }

    const recognition = await getRecognitionForDocument(documentId);
    const exportedAt = new Date().toISOString();
    const caseData = { caseNumber: legalCase.caseNumber, clientName: legalCase.clientName, title: legalCase.title };
    const growthPrimary =
      doc.extractedFields != null && typeof doc.extractedFields === "object" && "growthExtraction" in doc.extractedFields
        ? ((doc.extractedFields as Record<string, unknown>).growthExtraction as { serviceDates?: { primaryServiceDate?: string | null } | null })?.serviceDates?.primaryServiceDate ?? undefined
        : undefined;
    const ctx = buildDocumentNamingContext(caseData, doc, recognition, exportedAt, growthPrimary);

    const rules = await getFirmExportNamingRules(firmId);
    const ext = (doc.originalName ?? "").split(".").pop()?.toLowerCase() || "pdf";
    let fileName: string;
    let folderPath: string;
    if (exportFileNameOverride) {
      fileName = exportFileNameOverride.includes(".") ? exportFileNameOverride : `${exportFileNameOverride}.${ext}`;
    } else {
      const baseName = rules ? applyFilePattern(rules, ctx) : (doc.originalName ?? "document").replace(/\.[^.]+$/, "") || "document";
      fileName = `${baseName}.${ext}`;
    }
    if (exportFolderPathOverride !== null && exportFolderPathOverride !== undefined) {
      folderPath = exportFolderPathOverride;
    } else {
      const caseCtx = buildDocumentNamingContext(caseData, { id: doc.id, originalName: doc.originalName }, null, exportedAt);
      const caseLevelFolder = rules ? applyFolderPattern(rules, caseCtx) : "";
      const docTypeFolder = rules ? getFolderForDocType(rules, ctx.documentType) : "";
      folderPath = [caseLevelFolder, docTypeFolder].filter(Boolean).join("/");
    }

    res.json({
      ok: true,
      needsRouting: false,
      fileName,
      folderPath: folderPath || null,
      context: {
        caseNumber: ctx.caseNumber,
        clientName: ctx.clientName,
        caseTitle: ctx.caseTitle,
        documentType: ctx.documentType,
        providerName: ctx.providerName,
        serviceDate: ctx.serviceDate,
        originalName: ctx.originalName,
      },
      exportFileNameOverride: exportFileNameOverride ?? undefined,
      exportFolderPathOverride: exportFolderPathOverride ?? undefined,
    });
  } catch (e: any) {
    console.error("[documents/export-preview]", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Route explainability: why routed / needs_review, confidence, threshold, extracted fields, candidate match, signals, matched patterns
app.get("/documents/:id/route-explainer", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: {
        id: true,
        routedCaseId: true,
        routingStatus: true,
        routedSystem: true,
        status: true,
        confidence: true,
        extractedFields: true,
        originalName: true,
        source: true,
      },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document not found" });
    }

    const [recRows, rule, suggestedCase, extracted, textRows] = await Promise.all([
      pgPool.query(
        `select match_confidence, match_reason, suggested_case_id, case_number, client_name, doc_type
         from document_recognition where document_id = $1`,
        [documentId]
      ),
      prisma.routingRule.findUnique({
        where: { firmId },
        select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
      }),
      doc.routedCaseId
        ? prisma.legalCase.findFirst({
            where: { id: doc.routedCaseId, firmId },
            select: { id: true, caseNumber: true, title: true, clientName: true },
          })
        : Promise.resolve(null),
      getExtractedForRouting(documentId),
      pgPool.query<{ text_excerpt: string | null }>(
        `select text_excerpt from document_recognition where document_id = $1`,
        [documentId]
      ),
    ]);

    const rec = (recRows as { rows: { match_confidence: unknown; match_reason: string | null; suggested_case_id: string | null; case_number: string | null; client_name: string | null; doc_type: string | null }[] }).rows[0] ?? null;
    const matchConfidence = rec?.match_confidence != null ? Number(rec.match_confidence) : doc.confidence ?? null;
    const threshold = rule?.minAutoRouteConfidence ?? 0.9;
    const autoRouteEnabled = rule?.autoRouteEnabled ?? false;

    const extractedFieldsUsed = {
      caseNumber: rec?.case_number ?? null,
      clientName: rec?.client_name ?? null,
      docType: rec?.doc_type ?? null,
    };

    let scoreResult: RoutingScoreResult | null = null;
    try {
      scoreResult = await scoreDocumentRouting(
        {
          id: documentId,
          firmId,
          originalName: doc.originalName,
          source: doc.source,
          routedCaseId: doc.routedCaseId,
          status: doc.status,
        },
        {
          caseNumber: extracted?.caseNumber ?? rec?.case_number,
          clientName: extracted?.clientName ?? rec?.client_name,
          docType: extracted?.docType ?? rec?.doc_type,
        },
        (textRows as { rows: { text_excerpt: string | null }[] }).rows[0]?.text_excerpt ?? null
      );
    } catch (_) {
      // scorer may fail if patterns/feedback tables missing
    }

    const candidateMatches: { caseId: string; caseNumber: string | null; caseTitle: string | null; confidence: number; reason: string; source?: string }[] = [];
    if (scoreResult && scoreResult.candidates.length > 0) {
      candidateMatches.push(
        ...scoreResult.candidates.map((c) => ({
          caseId: c.caseId,
          caseNumber: c.caseNumber,
          caseTitle: c.caseTitle,
          confidence: c.confidence,
          reason: c.reason,
          source: c.source,
        }))
      );
    } else if (rec?.suggested_case_id && matchConfidence != null && matchConfidence > 0) {
      const caseRow = await prisma.legalCase.findFirst({
        where: { id: rec.suggested_case_id, firmId },
        select: { id: true, caseNumber: true, title: true, clientName: true },
      });
      candidateMatches.push({
        caseId: rec.suggested_case_id,
        caseNumber: caseRow?.caseNumber ?? null,
        caseTitle: caseRow?.title ?? null,
        confidence: matchConfidence,
        reason: rec?.match_reason ?? "Matched",
      });
    }

    const whyPassed =
      doc.routingStatus === "routed" && doc.routedCaseId
        ? doc.routedSystem === "auto"
          ? `Auto-routed: match confidence ${matchConfidence != null ? (matchConfidence * 100).toFixed(0) : "—"}% ≥ threshold ${(threshold * 100).toFixed(0)}%. ${rec?.match_reason ?? ""}`
          : "Manually routed by user."
        : null;
    const whyFailed =
      doc.routingStatus === "needs_review" || !doc.routedCaseId
        ? !rec?.suggested_case_id && (!scoreResult || scoreResult.candidates.length === 0)
          ? "No matching case found."
          : matchConfidence != null && matchConfidence < threshold
            ? `Match confidence ${(matchConfidence * 100).toFixed(0)}% below auto-route threshold ${(threshold * 100).toFixed(0)}%. ${rec?.match_reason ?? ""}`
            : !autoRouteEnabled
              ? "Auto-route is disabled."
              : "Needs review."
        : null;

    res.json({
      ok: true,
      routedCaseId: doc.routedCaseId ?? null,
      routingStatus: doc.routingStatus ?? null,
      routedSystem: doc.routedSystem ?? null,
      confidence: scoreResult?.confidence ?? matchConfidence,
      chosenCaseId: scoreResult?.chosenCaseId ?? null,
      chosenDocType: scoreResult?.chosenDocType ?? null,
      signals: scoreResult?.signals ?? {
        caseNumber: extractedFieldsUsed.caseNumber,
        clientName: extractedFieldsUsed.clientName,
        docType: extractedFieldsUsed.docType,
        fileName: doc.originalName,
        source: doc.source,
        baseMatchReason: rec?.match_reason ?? null,
      },
      matchedPatterns: scoreResult?.matchedPatterns ?? [],
      extractedFieldsUsed,
      extractedFields: doc.extractedFields,
      threshold,
      autoRouteEnabled,
      candidateMatches,
      whyPassed,
      whyFailed,
      routedCase: suggestedCase
        ? { id: suggestedCase.id, caseNumber: suggestedCase.caseNumber, title: suggestedCase.title, clientName: suggestedCase.clientName }
        : null,
    });
  } catch (e: any) {
    console.error("[documents/route-explainer]", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Submit routing feedback (was this correct? / correction)
app.post("/documents/:id/routing-feedback", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix ?? (req as any).userId ?? "api";
    const body = (req.body ?? {}) as {
      finalCaseId?: string | null;
      finalStatus?: string | null;
      finalDocType?: string | null;
      correctedBy?: string | null;
    };

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, routedCaseId: true, status: true, originalName: true, source: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    const { rows: recRows } = await pgPool.query<{ suggested_case_id: string | null; match_confidence: number | null; doc_type: string | null; case_number: string | null; client_name: string | null; provider_name?: string | null }>(
      `select suggested_case_id, match_confidence, doc_type, case_number, client_name, provider_name from document_recognition where document_id = $1`,
      [documentId]
    );
    const rec = recRows[0];
    const predictedCaseId = doc.routedCaseId ?? rec?.suggested_case_id ?? null;
    const predictedStatus = doc.status ?? null;
    const predictedDocType = rec?.doc_type ?? null;
    const predictedConfidence = rec?.match_confidence != null ? Number(rec.match_confidence) : null;

    const finalCaseId = body.finalCaseId !== undefined ? body.finalCaseId : doc.routedCaseId;
    const finalStatus = body.finalStatus !== undefined ? body.finalStatus : doc.status;
    const finalDocType = body.finalDocType !== undefined ? body.finalDocType : predictedDocType;

    const features = {
      caseNumber: rec?.case_number ?? null,
      clientName: rec?.client_name ?? null,
      docType: predictedDocType,
      fileName: doc.originalName,
      source: doc.source,
      providerName: rec?.provider_name ?? null,
    };

    await recordRoutingFeedback(
      {
        firmId,
        documentId,
        finalCaseId,
        finalStatus,
        finalDocType,
        correctedBy: body.correctedBy ?? actor,
      },
      {
        caseId: predictedCaseId,
        status: predictedStatus,
        docType: predictedDocType,
        confidence: predictedConfidence,
      },
      features
    );

    res.json({ ok: true, message: "Routing feedback recorded" });
  } catch (e: any) {
    console.error("[documents/routing-feedback]", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Submit extraction feedback (corrected value for a field)
app.post("/documents/:id/extraction-feedback", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const documentId = String(req.params.id ?? "");
    const actor = (req as any).apiKeyPrefix ?? (req as any).userId ?? "api";
    const body = (req.body ?? {}) as {
      firmId?: string;
      fieldKey?: string;
      correctedValue?: string | null;
      wasCorrect?: boolean;
      correctedBy?: string | null;
    };
    const fieldKey = typeof body.fieldKey === "string" ? body.fieldKey.trim() : "";
    if (!fieldKey) return res.status(400).json({ ok: false, error: "fieldKey is required" });

    const doc = await prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: { id: true, extractedFields: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "document not found" });

    const extracted = (doc.extractedFields as Record<string, unknown>) || {};
    const predictedValue = (extracted[fieldKey] as string) ?? null;
    const correctedValue = body.correctedValue !== undefined ? body.correctedValue : null;
    const wasCorrect = body.wasCorrect === true;

    await prisma.extractionFeedback.create({
      data: {
        firmId,
        documentId,
        fieldKey,
        predictedValue,
        correctedValue,
        wasCorrect,
        correctedBy: body.correctedBy ?? actor,
      },
    });

    await addDocumentAuditEvent({
      firmId,
      documentId,
      actor: body.correctedBy ?? actor,
      action: "extraction_feedback",
      fromCaseId: null,
      toCaseId: null,
      metaJson: { fieldKey, wasCorrect, correctedValue },
    });

    res.json({ ok: true, message: "Extraction feedback recorded" });
  } catch (e: any) {
    console.error("[documents/extraction-feedback]", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ----- Routing patterns (firm-scoped) -----
app.get("/routing/patterns", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const list = await prisma.routingPattern.findMany({
      where: { firmId },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
    res.json({ ok: true, items: list });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/routing/patterns", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const body = (req.body ?? {}) as {
      name?: string;
      docType?: string | null;
      providerName?: string | null;
      source?: string | null;
      fileNamePattern?: string | null;
      keywordsJson?: string[] | null;
      targetCaseId?: string | null;
      targetFolder?: string | null;
      priority?: number;
      active?: boolean;
    };
    const name = body.name?.trim();
    if (!name) return res.status(400).json({ ok: false, error: "name required" });
    const pattern = await prisma.routingPattern.create({
      data: {
        firmId,
        name,
        docType: body.docType ?? null,
        providerName: body.providerName ?? null,
        source: body.source ?? null,
        fileNamePattern: body.fileNamePattern ?? null,
        keywordsJson: body.keywordsJson != null ? (body.keywordsJson as Prisma.InputJsonValue) : Prisma.JsonNull,
        targetCaseId: body.targetCaseId ?? null,
        targetFolder: body.targetFolder ?? null,
        priority: body.priority ?? 100,
        active: body.active !== false,
      },
    });
    res.status(201).json({ ok: true, item: pattern });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/routing/patterns/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as {
      name?: string;
      docType?: string | null;
      providerName?: string | null;
      source?: string | null;
      fileNamePattern?: string | null;
      keywordsJson?: string[] | null;
      targetCaseId?: string | null;
      targetFolder?: string | null;
      priority?: number;
      active?: boolean;
    };
    const existing = await prisma.routingPattern.findFirst({ where: { id, firmId } });
    if (!existing) return res.status(404).json({ ok: false, error: "pattern not found" });
    const pattern = await prisma.routingPattern.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.docType !== undefined && { docType: body.docType }),
        ...(body.providerName !== undefined && { providerName: body.providerName }),
        ...(body.source !== undefined && { source: body.source }),
        ...(body.fileNamePattern !== undefined && { fileNamePattern: body.fileNamePattern }),
        ...(body.keywordsJson !== undefined && { keywordsJson: body.keywordsJson != null ? (body.keywordsJson as Prisma.InputJsonValue) : Prisma.JsonNull }),
        ...(body.targetCaseId !== undefined && { targetCaseId: body.targetCaseId }),
        ...(body.targetFolder !== undefined && { targetFolder: body.targetFolder }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.active !== undefined && { active: body.active }),
      },
    });
    res.json({ ok: true, item: pattern });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete("/routing/patterns/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const existing = await prisma.routingPattern.findFirst({ where: { id, firmId } });
    if (!existing) return res.status(404).json({ ok: false, error: "pattern not found" });
    await prisma.routingPattern.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Routing learning stats: accepted vs corrected, top wins, top misses
app.get("/routing/learning-stats", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const [acceptedCount, correctedCount, recentAccepted, recentCorrected] = await Promise.all([
      prisma.routingFeedback.count({ where: { firmId, wasAccepted: true } }),
      prisma.routingFeedback.count({ where: { firmId, wasAccepted: false } }),
      prisma.routingFeedback.findMany({
        where: { firmId, wasAccepted: true },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
      prisma.routingFeedback.findMany({
        where: { firmId, wasAccepted: false },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({
      ok: true,
      acceptedCount,
      correctedCount,
      topWins: recentAccepted.map((f) => ({ documentId: f.documentId, finalCaseId: f.finalCaseId, createdAt: f.createdAt })),
      topMisses: recentCorrected.map((f) => ({ documentId: f.documentId, predictedCaseId: f.predictedCaseId, finalCaseId: f.finalCaseId, createdAt: f.createdAt })),
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
      const body = (req.body ?? {}) as { firmId?: string; question?: string };
      const question = typeof body.question === "string" ? body.question.trim() : undefined;

      const doc = await prisma.document.findFirst({
        where: { id: documentId, firmId },
        select: { id: true, firmId: true, extractedFields: true },
      });
      if (!doc) {
        return res.status(404).json({ ok: false, error: "document not found" });
      }

      const { rows } = await pgPool.query<{ text_excerpt: string | null }>(
        `select text_excerpt from document_recognition where document_id = $1`,
        [documentId]
      );
      const ocrText = rows[0]?.text_excerpt ?? null;

      const result = await explainDocument(
        ocrText,
        doc.extractedFields ?? null,
        question
      );

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

      res.json({ ok: true, ...result });
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
app.use(errorLogMiddleware);
app.listen(port, () => console.log(`API listening on :${port}`));

