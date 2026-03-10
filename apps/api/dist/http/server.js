"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const docRecognition_1 = require("../ai/docRecognition");
const riskAnalyzer_1 = require("../ai/riskAnalyzer");
const documentInsights_1 = require("../ai/documentInsights");
const documentSummary_1 = require("../ai/documentSummary");
const docClassifier_1 = require("../ai/docClassifier");
const extractors_1 = require("../ai/extractors");
const insuranceOfferExtractor_1 = require("../ai/extractors/insuranceOfferExtractor");
const courtExtractor_1 = require("../ai/extractors/courtExtractor");
const storage_1 = require("../services/storage");
const pg_1 = require("../db/pg");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../db/prisma");
const auth_1 = require("./middleware/auth");
const authScope_1 = require("./middleware/authScope");
const requireRole_1 = require("./middleware/requireRole");
const requireAdminOrFirmAdmin_1 = require("./middleware/requireAdminOrFirmAdmin");
const requireAdminOrFirmAdminForProvider_1 = require("./middleware/requireAdminOrFirmAdminForProvider");
const providerSession_1 = require("./middleware/providerSession");
const requireExportFirm_1 = require("./middleware/requireExportFirm");
const rateLimitEndpoint_1 = require("./middleware/rateLimitEndpoint");
const errorLogMiddleware_1 = require("./middleware/errorLogMiddleware");
const storage_2 = require("../services/storage");
const queue_1 = require("../services/queue");
const caseMatching_1 = require("../services/caseMatching");
const caseTimeline_1 = require("../services/caseTimeline");
const caseInsights_1 = require("../services/caseInsights");
const notifications_1 = require("../services/notifications");
const caseReportPdf_1 = require("../services/caseReportPdf");
const docketFetcher_1 = require("../court/docketFetcher");
const imapPoller_1 = require("../email/imapPoller");
const documentRouting_1 = require("../services/documentRouting");
const narrativeAssistant_1 = require("../ai/narrativeAssistant");
const documentExplain_1 = require("../ai/documentExplain");
const recordsLetterGenerator_1 = require("../ai/recordsLetterGenerator");
const pushService_1 = require("../integrations/crm/pushService");
const recordsLetterPdf_1 = require("../services/recordsLetterPdf");
const offersSummaryPdf_1 = require("../services/offersSummaryPdf");
const compositeAdapter_1 = require("../send/compositeAdapter");
const clioAdapter_1 = require("../integrations/clioAdapter");
const storage_3 = require("../services/storage");
const featureFlags_1 = require("../services/featureFlags");
const cases_1 = __importDefault(require("./routes/cases"));
const traffic_1 = __importDefault(require("./routes/traffic"));
const client_1 = require("@prisma/client");
const clioExport_1 = require("../exports/clioExport");
const clioMappingsImport_1 = require("../services/clioMappingsImport");
const errorLog_1 = require("../services/errorLog");
const jwt_1 = require("../lib/jwt");
const webhooks_1 = require("../services/webhooks");
const app = (0, express_1.default)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: "25mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/healthz", (_req, res) => res.json({ ok: true, service: "api" }));
app.get("/readyz", async (_req, res) => {
    try {
        await pg_1.pgPool.query("SELECT 1");
    }
    catch (e) {
        return res.status(503).json({ ok: false, error: String(e.message) });
    }
    try {
        const { HeadBucketCommand } = await Promise.resolve().then(() => __importStar(require("@aws-sdk/client-s3")));
        const { s3, bucket } = await Promise.resolve().then(() => __importStar(require("../services/storage")));
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    }
    catch {
        // Spaces connectivity check is optional
    }
    res.json({ ok: true });
});
// --- Dashboard auth (browser login flow) ---
// POST /auth/login — email + password; returns JWT for use as Bearer.
app.post("/auth/login", async (req, res) => {
    try {
        const body = req.body;
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!email || !password) {
            return res.status(400).json({ ok: false, error: "Email and password required" });
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { email },
            include: { firm: { select: { id: true, name: true, plan: true, status: true } } },
        });
        if (!user) {
            return res.status(401).json({ ok: false, error: "Invalid email or password" });
        }
        const isDemo = process.env.NODE_ENV !== "production" &&
            !user.passwordHash &&
            (password === "demo" || password === "password");
        const passwordOk = isDemo || (user.passwordHash && (await bcryptjs_1.default.compare(password, user.passwordHash)));
        if (!passwordOk) {
            return res.status(401).json({ ok: false, error: "Invalid email or password" });
        }
        const token = (0, jwt_1.signToken)({
            userId: user.id,
            firmId: user.firmId,
            role: user.role,
            email: user.email,
        });
        return res.json({ ok: true, token });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
});
// GET /auth/me — requires Bearer (JWT or API key). Returns current user/firm for dashboard.
app.get("/auth/me", auth_1.auth, async (req, res) => {
    try {
        const firmId = req.firmId;
        const userId = req.userId;
        const authRole = req.authRole;
        const [user, firm] = await Promise.all([
            userId
                ? prisma_1.prisma.user.findUnique({
                    where: { id: userId },
                    select: { id: true, email: true, role: true },
                })
                : null,
            prisma_1.prisma.firm.findUnique({
                where: { id: firmId },
                select: { id: true, name: true, plan: true, status: true },
            }),
        ]);
        if (!firm) {
            return res.status(404).json({ ok: false, error: "Firm not found" });
        }
        const role = (user?.role ?? authRole);
        return res.json({
            ok: true,
            user: user
                ? { id: user.id, email: user.email, role: user.role }
                : { id: "", email: "", role },
            firm: { id: firm.id, name: firm.name, plan: firm.plan, status: firm.status },
            role,
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
});
// Stub OAuth: redirect back to web app with error so login page can show "use email/password"
app.get("/auth/google", (req, res) => {
    const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
    if (redirectUri)
        res.redirect(302, `${redirectUri}?error=oauth_not_implemented`);
    else
        res.status(501).json({ ok: false, error: "OAuth not configured; use email/password" });
});
app.get("/auth/microsoft", (req, res) => {
    const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
    if (redirectUri)
        res.redirect(302, `${redirectUri}?error=oauth_not_implemented`);
    else
        res.status(501).json({ ok: false, error: "OAuth not configured; use email/password" });
});
app.use("/cases", cases_1.default);
app.use("/traffic", traffic_1.default);
// Admin: list firms with stats (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/firms", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (_req, res) => {
    try {
        const [firms, docCounts, userCounts, usageAgg] = await Promise.all([
            prisma_1.prisma.firm.findMany({
                select: { id: true, name: true, status: true, plan: true, pageLimitMonthly: true, createdAt: true },
                orderBy: { createdAt: "desc" },
            }),
            prisma_1.prisma.document.groupBy({
                by: ["firmId"],
                _count: { id: true },
            }),
            prisma_1.prisma.user.groupBy({
                by: ["firmId"],
                _count: { id: true },
            }),
            prisma_1.prisma.usageMonthly.groupBy({
                by: ["firmId"],
                _sum: { docsProcessed: true, narrativeGenerated: true, pagesProcessed: true },
            }),
        ]);
        const docByFirm = new Map(docCounts.map((d) => [d.firmId, d._count.id]));
        const userByFirm = new Map(userCounts.map((u) => [u.firmId, u._count.id]));
        const usageByFirm = new Map(usageAgg.map((u) => [
            u.firmId,
            {
                documentsProcessed: u._sum.docsProcessed ?? 0,
                narrativeGenerated: u._sum.narrativeGenerated ?? 0,
                pagesProcessed: u._sum.pagesProcessed ?? 0,
            },
        ]));
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
    }
    catch (e) {
        console.error("[admin/firms]", e);
        res.status(500).json({ ok: false, error: "Failed to load firms" });
    }
});
// Admin: get firm details, users, api keys, usage (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/firms/:firmId", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (req, res) => {
    try {
        const firmId = String(req.params.firmId ?? "");
        const now = new Date();
        const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const firm = await prisma_1.prisma.firm.findUnique({
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
        if (!firm)
            return res.status(404).json({ ok: false, error: "Firm not found" });
        const usageRow = await prisma_1.prisma.usageMonthly.findUnique({
            where: { firmId_yearMonth: { firmId, yearMonth: ym } },
            select: { yearMonth: true, pagesProcessed: true, docsProcessed: true, updatedAt: true },
        });
        const [docCount] = await prisma_1.prisma.document.groupBy({
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
    }
    catch (e) {
        console.error("[admin/firms/:firmId]", e);
        res.status(500).json({ ok: false, error: "Failed to load firm" });
    }
});
// Admin: update firm plan/pageLimitMonthly/status (requires PLATFORM_ADMIN_API_KEY)
app.patch("/admin/firms/:firmId", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (req, res) => {
    try {
        const firmId = String(req.params.firmId ?? "");
        const body = (req.body ?? {});
        const data = {};
        if (typeof body.plan === "string" && body.plan.trim())
            data.plan = body.plan.trim();
        if (typeof body.pageLimitMonthly === "number" && body.pageLimitMonthly >= 0)
            data.pageLimitMonthly = body.pageLimitMonthly;
        if (typeof body.status === "string" && body.status.trim())
            data.status = body.status.trim();
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ ok: false, error: "No valid fields to update" });
        }
        const firm = await prisma_1.prisma.firm.update({
            where: { id: firmId },
            data,
            select: { id: true, name: true, plan: true, pageLimitMonthly: true, status: true },
        });
        res.json({ ok: true, firm });
    }
    catch (e) {
        if (e?.code === "P2025")
            return res.status(404).json({ ok: false, error: "Firm not found" });
        console.error("[admin/firms/:firmId PATCH]", e);
        res.status(500).json({ ok: false, error: "Failed to update firm" });
    }
});
// POST /firms — create firm (PLATFORM_ADMIN_API_KEY)
app.post("/firms", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (req, res) => {
    try {
        const { name, plan } = (req.body ?? {});
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ ok: false, error: "name is required" });
        }
        const firm = await prisma_1.prisma.firm.create({
            data: {
                name: name.trim(),
                plan: typeof plan === "string" && plan.trim() ? plan.trim() : "starter",
            },
            select: { id: true, name: true, plan: true },
        });
        res.json({ ok: true, firm });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// POST /firms/:id/users — create user (PLATFORM_ADMIN or FIRM_ADMIN for this firm)
app.post("/firms/:id/users", auth_1.auth, requireAdminOrFirmAdmin_1.requireAdminOrFirmAdminForFirm, async (req, res) => {
    try {
        const firmId = String(req.params.id ?? "");
        const { email, role } = (req.body ?? {});
        if (!email || typeof email !== "string" || !email.trim()) {
            return res.status(400).json({ ok: false, error: "email is required" });
        }
        const roleEnum = role === "STAFF" ? "STAFF" : "FIRM_ADMIN";
        const user = await prisma_1.prisma.user.create({
            data: {
                firmId,
                email: email.trim().toLowerCase(),
                role: roleEnum,
            },
            select: { id: true, email: true, role: true, firmId: true },
        });
        res.json({ ok: true, user });
    }
    catch (e) {
        if (e?.code === "P2002")
            return res.status(409).json({ ok: false, error: "Email already exists" });
        if (e?.code === "P2003")
            return res.status(404).json({ ok: false, error: "Firm not found" });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// POST /firms/:id/api-keys — create API key (PLATFORM_ADMIN or FIRM_ADMIN for this firm)
app.post("/firms/:id/api-keys", auth_1.auth, requireAdminOrFirmAdmin_1.requireAdminOrFirmAdminForFirm, async (req, res) => {
    try {
        const firmId = String(req.params.id ?? "");
        const { name } = (req.body ?? {});
        const rawKey = "sk_live_" + crypto_1.default.randomBytes(24).toString("hex");
        const keyHash = await bcryptjs_1.default.hash(rawKey, 10);
        const apiKey = await prisma_1.prisma.apiKey.create({
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
    }
    catch (e) {
        if (e?.code === "P2003")
            return res.status(404).json({ ok: false, error: "Firm not found" });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Clio CSV exports (auth + STAFF role, firmId from key or query)
app.get("/exports/clio/contacts.csv", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), requireExportFirm_1.requireExportFirm, async (req, res) => {
    try {
        const firmId = req.firmId;
        const csv = await (0, clioExport_1.generateClioContactsCsv)(firmId);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="clio-contacts.csv"');
        res.send(Buffer.from(csv, "utf-8"));
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/exports/clio/matters.csv", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), requireExportFirm_1.requireExportFirm, async (req, res) => {
    try {
        const firmId = req.firmId;
        const csv = await (0, clioExport_1.generateClioMattersCsv)(firmId);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="clio-matters.csv"');
        res.send(Buffer.from(csv, "utf-8"));
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Clio matter ID mappings (import CSV, list)
app.get("/crm/clio/mappings", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const mappings = await prisma_1.prisma.crmCaseMapping.findMany({
            where: { firmId },
            orderBy: { createdAt: "desc" },
        });
        const caseIds = [...new Set(mappings.map((m) => m.caseId))];
        const cases = await prisma_1.prisma.legalCase.findMany({
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
    }
    catch (e) {
        console.error("GET /crm/clio/mappings", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/crm/clio/mappings/import", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), upload.single("file"), async (req, res) => {
    try {
        const firmId = req.firmId;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "Missing file (multipart field name must be 'file')" });
        }
        const result = await (0, clioMappingsImport_1.importClioMappingsFromCsv)(firmId, file.buffer);
        res.json(result);
    }
    catch (e) {
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
});
// Webhook endpoints
app.get("/webhooks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const items = await prisma_1.prisma.webhookEndpoint.findMany({
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
    }
    catch (e) {
        console.error("GET /webhooks", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/webhooks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        const url = typeof body.url === "string" ? body.url.trim() : "";
        const secret = typeof body.secret === "string" ? body.secret.trim() : "";
        const events = Array.isArray(body.events)
            ? body.events.filter((e) => typeof e === "string" && (e === "*" || webhooks_1.WEBHOOK_EVENTS.includes(e)))
            : ["*"];
        if (!url)
            return res.status(400).json({ error: "url is required" });
        if (!secret)
            return res.status(400).json({ error: "secret is required" });
        try {
            new URL(url);
        }
        catch {
            return res.status(400).json({ error: "url must be a valid URL" });
        }
        const created = await prisma_1.prisma.webhookEndpoint.create({
            data: { firmId, url, secret, eventsJson: events, enabled: true },
            select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
        });
        res.status(201).json({ ok: true, item: created });
    }
    catch (e) {
        console.error("POST /webhooks", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.patch("/webhooks/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const existing = await prisma_1.prisma.webhookEndpoint.findFirst({
            where: { id, firmId },
        });
        if (!existing)
            return res.status(404).json({ error: "Webhook not found" });
        const update = {};
        if (typeof body.url === "string" && body.url.trim()) {
            try {
                new URL(body.url.trim());
                update.url = body.url.trim();
            }
            catch {
                return res.status(400).json({ error: "url must be a valid URL" });
            }
        }
        if (typeof body.secret === "string" && body.secret.trim())
            update.secret = body.secret.trim();
        if (Array.isArray(body.events)) {
            update.eventsJson = body.events.filter((e) => typeof e === "string" && (e === "*" || webhooks_1.WEBHOOK_EVENTS.includes(e)));
        }
        if (typeof body.enabled === "boolean")
            update.enabled = body.enabled;
        const item = await prisma_1.prisma.webhookEndpoint.update({
            where: { id },
            data: update,
            select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
        });
        res.json({ ok: true, item });
    }
    catch (e) {
        console.error("PATCH /webhooks/:id", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.delete("/webhooks/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const existing = await prisma_1.prisma.webhookEndpoint.findFirst({ where: { id, firmId } });
        if (!existing)
            return res.status(404).json({ error: "Webhook not found" });
        await prisma_1.prisma.webhookEndpoint.delete({ where: { id } });
        res.json({ ok: true });
    }
    catch (e) {
        console.error("DELETE /webhooks/:id", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Webhooks (firm-scoped) ===
app.get("/webhooks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const endpoints = await prisma_1.prisma.webhookEndpoint.findMany({
            where: { firmId },
            orderBy: { createdAt: "desc" },
            select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
        });
        res.json({ ok: true, items: endpoints });
    }
    catch (e) {
        console.error("GET /webhooks", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/webhooks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        const url = typeof body.url === "string" ? body.url.trim() : "";
        const secret = typeof body.secret === "string" ? body.secret.trim() : "";
        if (!url)
            return res.status(400).json({ error: "url is required" });
        if (!secret || secret.length < 16)
            return res.status(400).json({ error: "secret must be at least 16 characters" });
        const events = Array.isArray(body.events) ? body.events.filter((e) => typeof e === "string") : [];
        const eventsJson = events.length > 0 ? events : ["document.processed", "document.routed", "case.created"];
        const ep = await prisma_1.prisma.webhookEndpoint.create({
            data: { firmId, url, secret, eventsJson, enabled: body.enabled !== false },
            select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
        });
        res.status(201).json({ ok: true, item: ep });
    }
    catch (e) {
        console.error("POST /webhooks", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.patch("/webhooks/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const existing = await prisma_1.prisma.webhookEndpoint.findFirst({
            where: { id, firmId },
        });
        if (!existing)
            return res.status(404).json({ error: "Webhook not found" });
        const data = {};
        if (typeof body.url === "string" && body.url.trim())
            data.url = body.url.trim();
        if (typeof body.secret === "string" && body.secret.length >= 16)
            data.secret = body.secret.trim();
        if (Array.isArray(body.events))
            data.eventsJson = body.events.filter((e) => typeof e === "string");
        if (typeof body.enabled === "boolean")
            data.enabled = body.enabled;
        const ep = await prisma_1.prisma.webhookEndpoint.update({
            where: { id },
            data,
            select: { id: true, url: true, eventsJson: true, enabled: true, createdAt: true },
        });
        res.json({ ok: true, item: ep });
    }
    catch (e) {
        console.error("PATCH /webhooks/:id", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Admin: jobs list and retry (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/jobs", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
        const statusFilter = typeof req.query.status === "string" && req.query.status.trim()
            ? req.query.status.trim()
            : null;
        const firmIdFilter = typeof req.query.firmId === "string" && req.query.firmId.trim()
            ? req.query.firmId.trim()
            : null;
        const items = await prisma_1.prisma.job.findMany({
            where: {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(firmIdFilter ? { firmId: firmIdFilter } : {}),
            },
            orderBy: [{ createdAt: "desc" }],
            take: limit,
            include: { firm: { select: { name: true } } },
        });
        res.json({ ok: true, items });
    }
    catch (e) {
        next(e);
    }
});
app.post("/admin/jobs/:id/retry", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (req, res, next) => {
    try {
        const id = String(req.params.id ?? "");
        const job = await prisma_1.prisma.job.findUnique({ where: { id } });
        if (!job)
            return res.status(404).json({ ok: false, error: "Job not found" });
        if (job.status !== "failed") {
            return res.status(400).json({ ok: false, error: "Can only retry failed jobs" });
        }
        await prisma_1.prisma.job.update({
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
    }
    catch (e) {
        next(e);
    }
});
// Admin: recent system errors (requires PLATFORM_ADMIN_API_KEY)
app.get("/admin/errors", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
        const serviceFilter = typeof req.query.service === "string" && req.query.service.trim()
            ? req.query.service.trim()
            : null;
        const logs = await prisma_1.prisma.systemErrorLog.findMany({
            where: serviceFilter ? { service: serviceFilter } : undefined,
            orderBy: { createdAt: "desc" },
            take: limit,
        });
        res.json({ ok: true, errors: logs });
    }
    catch (e) {
        next(e);
    }
});
// Admin: quality-control analytics (requires PLATFORM_ADMIN_API_KEY)
// Query params: firmId, dateFrom (ISO date), dateTo (ISO date), groupBy (day|week|month)
app.get("/admin/quality/analytics", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.PLATFORM_ADMIN), async (_req, res, next) => {
    try {
        const q = _req.query || {};
        const firmIdFilter = typeof q.firmId === "string" && q.firmId.trim() ? q.firmId.trim() : null;
        const dateFrom = typeof q.dateFrom === "string" && q.dateFrom.trim()
            ? new Date(q.dateFrom.trim())
            : null;
        const dateToRaw = typeof q.dateTo === "string" && q.dateTo.trim()
            ? new Date(q.dateTo.trim())
            : null;
        const dateTo = dateToRaw && !isNaN(dateToRaw.getTime())
            ? (() => {
                const d = new Date(dateToRaw);
                d.setUTCHours(23, 59, 59, 999);
                return d;
            })()
            : null;
        const groupBy = ["day", "week", "month"].includes(String(q.groupBy || "").toLowerCase())
            ? String(q.groupBy).toLowerCase()
            : null;
        const ingestedFilter = {};
        if (dateFrom && !isNaN(dateFrom.getTime()))
            ingestedFilter.gte = dateFrom;
        if (dateTo && !isNaN(dateTo.getTime()))
            ingestedFilter.lte = dateTo;
        const hasDateFilter = Object.keys(ingestedFilter).length > 0;
        const docWhereBase = {
            ...(firmIdFilter ? { firmId: firmIdFilter } : {}),
            ...(hasDateFilter ? { ingestedAt: ingestedFilter } : {}),
        };
        const [docsByStatus, totalDocs, processedDocs, autoRoutedCount, unmatchedCount, duplicateCount, latencyRows, usageAgg, failureReasons, firms, perFirmRows] = await Promise.all([
            prisma_1.prisma.document.groupBy({
                by: ["status"],
                where: docWhereBase,
                _count: { id: true },
            }),
            prisma_1.prisma.document.count({ where: docWhereBase }),
            prisma_1.prisma.document.count({
                where: { ...docWhereBase, status: { in: ["UPLOADED", "NEEDS_REVIEW", "UNMATCHED"] } },
            }),
            prisma_1.prisma.document.count({
                where: { ...docWhereBase, status: "UPLOADED" },
            }),
            prisma_1.prisma.document.count({
                where: { ...docWhereBase, status: "UNMATCHED" },
            }),
            prisma_1.prisma.document.count({
                where: { ...docWhereBase, duplicateOfId: { not: null } },
            }),
            (() => {
                const params = [];
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
                return pg_1.pgPool.query(sql, params);
            })(),
            firmIdFilter
                ? prisma_1.prisma.usageMonthly.aggregate({
                    where: { firmId: firmIdFilter },
                    _sum: { docsProcessed: true, duplicateDetected: true },
                })
                : prisma_1.prisma.usageMonthly.aggregate({
                    _sum: { docsProcessed: true, duplicateDetected: true },
                }),
            prisma_1.prisma.systemErrorLog.findMany({
                orderBy: { createdAt: "desc" },
                take: 500,
                select: { message: true },
            }),
            prisma_1.prisma.firm.findMany({
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            }),
            firmIdFilter
                ? Promise.resolve({ rows: [] })
                : (() => {
                    const params = [];
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
                    return pg_1.pgPool.query(sql, params);
                })(),
        ]);
        const latencyRow = latencyRows.rows?.[0];
        const avgLatencyMs = latencyRow?.avg_ms ?? null;
        const usage = usageAgg;
        const docsProcessedUsage = Number(usage._sum.docsProcessed ?? 0) || 1;
        const duplicateFromUsage = Number(usage._sum.duplicateDetected ?? 0);
        const duplicateRateFromUsage = docsProcessedUsage > 0 ? duplicateFromUsage / docsProcessedUsage : 0;
        const docsByStatusMap = Object.fromEntries(docsByStatus.map((r) => [r.status, r._count.id]));
        const statuses = ["RECEIVED", "PROCESSING", "NEEDS_REVIEW", "UPLOADED", "FAILED", "UNMATCHED"];
        const docsByStatusObj = Object.fromEntries(statuses.map((s) => [s, docsByStatusMap[s] ?? 0]));
        const autoRouteRate = processedDocs > 0 ? autoRoutedCount / processedDocs : 0;
        const unmatchedRate = processedDocs > 0 ? unmatchedCount / processedDocs : 0;
        const duplicateRateDoc = totalDocs > 0 ? duplicateCount / totalDocs : duplicateRateFromUsage;
        const firmByName = new Map(firms.map((f) => [f.id, f.name]));
        const perFirmData = perFirmRows.rows?.map((r) => {
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
        const messageCounts = new Map();
        for (const { message } of failureReasons) {
            const key = message.length > 120 ? message.slice(0, 120) + "…" : message;
            messageCounts.set(key, (messageCounts.get(key) ?? 0) + 1);
        }
        const topFailureReasons = Array.from(messageCounts.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        let timeSeries;
        if (groupBy && !firmIdFilter) {
            const trunc = groupBy === "day" ? "day" : groupBy === "week" ? "week" : "month";
            const tsParams = [];
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
            const { rows: tsRows } = await pg_1.pgPool.query(tsSql, tsParams);
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
        const body = {
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
        if (timeSeries)
            body.timeSeries = timeSeries;
        res.json(body);
    }
    catch (e) {
        next(e);
    }
});
// Admin demo seed: creates firm, cases, documents, timeline (dev only; in prod requires authApiKey)
// In non-production: bypasses auth, uses first firm or creates one (no DOC_API_KEY needed)
// Supports dryRun: true (returns created counts without writing)
app.post("/admin/demo/seed", async (req, res) => {
    const body = (req.body ?? {});
    const dryRun = body.dryRun === true;
    try {
        console.log("[DEMO SEED] running seed handler", { ts: new Date().toISOString(), dryRun });
        const isProd = process.env.NODE_ENV === "production";
        const demoMode = process.env.DEMO_MODE === "true";
        if (isProd && !demoMode) {
            return res.status(403).json({ ok: false, error: "Demo seed disabled in production" });
        }
        let firmId;
        if (isProd) {
            const token = (req.headers.authorization || req.headers.Authorization || "")?.toString().match(/^Bearer\s+(.+)$/i)?.[1];
            if (!token)
                return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <apiKey>" });
            const prefix = token.slice(0, 12);
            const candidates = await prisma_1.prisma.apiKey.findMany({ where: { keyPrefix: prefix, revokedAt: null }, take: 5 });
            let resolvedFirmId = null;
            for (const k of candidates) {
                if (await bcryptjs_1.default.compare(token, k.keyHash)) {
                    resolvedFirmId = k.firmId;
                    break;
                }
            }
            if (!resolvedFirmId)
                return res.status(401).json({ ok: false, error: "Invalid API key" });
            firmId = resolvedFirmId;
        }
        else {
            let firm = await prisma_1.prisma.firm.findFirst({ orderBy: { createdAt: "asc" } });
            if (!firm) {
                if (dryRun) {
                    return res.json({
                        ok: true,
                        dryRun: true,
                        wouldCreate: { firms: 1, cases: 3, documents: 10, timelineEvents: 8 },
                    });
                }
                firm = await prisma_1.prisma.firm.create({ data: { name: "Demo Firm" } });
                console.log("[DEMO SEED] created firm:", firm.id);
            }
            firmId = firm.id;
        }
        const firm = await prisma_1.prisma.firm.findUnique({ where: { id: firmId } });
        if (!firm)
            return res.status(404).json({ ok: false, error: "Firm not found" });
        if (dryRun) {
            return res.json({
                ok: true,
                dryRun: true,
                wouldCreate: { firms: 0, cases: 3, documents: 10, timelineEvents: 8 },
            });
        }
        // Clear existing demo data for this firm (delete in FK order)
        const { rows: caseRows } = await pg_1.pgPool.query('SELECT id FROM "Case" WHERE "firmId" = $1', [firmId]);
        const caseIds = caseRows.map((r) => r.id);
        const existingDocs = await prisma_1.prisma.document.findMany({ where: { firmId }, select: { id: true } });
        const docIds = existingDocs.map((d) => d.id);
        // 1. MedicalEvent references Document
        try {
            const del = await pg_1.pgPool.query('DELETE FROM "MedicalEvent" WHERE "firmId" = $1', [firmId]);
            if (del.rowCount && del.rowCount > 0) {
                console.log("[demo/seed] deleted MedicalEvent rows:", del.rowCount);
            }
        }
        catch (e) {
            console.warn("[demo/seed] MedicalEvent delete failed:", e);
        }
        // 2. CaseTimelineEvent references Case + Document
        await prisma_1.prisma.caseTimelineEvent.deleteMany({ where: { firmId } });
        await prisma_1.prisma.caseTimelineRebuild.deleteMany({ where: { firmId } });
        // 3. RecordsRequest references Case
        if (caseIds.length > 0) {
            await prisma_1.prisma.recordsRequest.deleteMany({ where: { caseId: { in: caseIds } } });
        }
        // 4. CrmPushLog references Case; CrmCaseMapping references Case
        await prisma_1.prisma.crmPushLog.deleteMany({ where: { firmId } });
        await prisma_1.prisma.crmCaseMapping.deleteMany({ where: { firmId } });
        // 5. DocumentAuditEvent references Document
        if (docIds.length > 0) {
            await prisma_1.prisma.documentAuditEvent.deleteMany({ where: { documentId: { in: docIds } } });
        }
        // 6. Document
        await prisma_1.prisma.document.deleteMany({ where: { firmId } });
        // 7. Case (raw SQL; Prisma schema may not match DB columns like clientId)
        await pg_1.pgPool.query('DELETE FROM "Case" WHERE "firmId" = $1', [firmId]);
        if (docIds.length > 0) {
            try {
                await pg_1.pgPool.query("DELETE FROM document_recognition WHERE document_id = ANY($1)", [docIds]);
            }
            catch { }
        }
        const now = new Date();
        // Create 3 cases with stable ids for demo
        const caseId1 = "demo-case-1";
        const caseId2 = "demo-case-2";
        const caseId3 = "demo-case-3";
        await pg_1.pgPool.query(`INSERT INTO "Case" (id, "firmId", title, "caseNumber", "clientName", "clientId", status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $5, 'active', $6), ($7, $2, $8, $9, $10, $10, 'active', $6), ($11, $2, $12, $13, $14, $14, 'active', $6)
       ON CONFLICT (id) DO NOTHING`, [caseId1, firmId, "Smith v. State Farm", "DEMO-001", "Alice Smith", now, caseId2, "Jones Medical Records", "DEMO-002", "Bob Jones", caseId3, "Wilson PI Claim", "DEMO-003", "Carol Wilson"]);
        // Map display case numbers to real case IDs so suggestedCaseId links correctly to /cases/:id
        const toSuggestedCaseId = (cn) => cn === "DEMO-001" ? caseId1 : cn === "DEMO-002" ? caseId2 : cn === "DEMO-003" ? caseId3 : null;
        const docData = [
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
        const createdDocIds = [];
        for (let i = 0; i < docData.length; i++) {
            const d = docData[i];
            const doc = await prisma_1.prisma.document.create({
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
                    extractedFields: d.caseNumber || d.clientName ? { caseNumber: d.caseNumber, clientName: d.clientName } : undefined,
                    processedAt: d.status === "UPLOADED" ? now : null,
                },
            });
            createdDocIds.push(doc.id);
            try {
                const matchConf = d.hasMatch && d.caseNumber ? 0.85 : null;
                const matchReason = d.hasMatch && d.caseNumber ? "Case number match" : null;
                const insFields = d.hasOffer ? JSON.stringify({ settlementOffer: 50000 }) : null;
                const suggestedCaseId = toSuggestedCaseId(d.caseNumber);
                await pg_1.pgPool.query(`INSERT INTO document_recognition (document_id, case_number, client_name, suggested_case_id, confidence, match_confidence, match_reason, insurance_fields, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (document_id) DO UPDATE SET
             case_number = EXCLUDED.case_number,
             client_name = EXCLUDED.client_name,
             suggested_case_id = EXCLUDED.suggested_case_id,
             confidence = EXCLUDED.confidence,
             match_confidence = EXCLUDED.match_confidence,
             match_reason = EXCLUDED.match_reason,
             insurance_fields = COALESCE(EXCLUDED.insurance_fields, document_recognition.insurance_fields),
             updated_at = now()`, [doc.id, d.caseNumber ?? null, d.clientName ?? null, suggestedCaseId, d.confidence ?? 0.5, matchConf, matchReason, insFields]);
            }
            catch (e) {
                console.warn("[demo/seed] document_recognition insert failed:", e);
            }
        }
        // 8 timeline events (createdDocIds has 10 elements; we need indices 0,1,2,5,7)
        const timelineDocs = createdDocIds.slice(0, 8);
        await prisma_1.prisma.caseTimelineEvent.createMany({
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
    }
    catch (e) {
        console.error("[admin/demo/seed]", e);
        (0, errorLog_1.logSystemError)("demo-seed", e).catch(() => { });
        res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
});
// TEMP dev route: create a firm
app.post("/dev/create-firm", async (req, res) => {
    const { name } = req.body ?? {};
    if (!name)
        return res.status(400).json({ error: "name is required" });
    const firm = await prisma_1.prisma.firm.create({ data: { name } });
    res.json(firm);
});
// TEMP dev route: create an API key for a firm (shows secret once)
// Dev-only: create API key for first/only firm (no auth, no firmId needed)
app.post("/admin/dev/create-api-key", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ ok: false, error: "Not found" });
    }
    let firm = await prisma_1.prisma.firm.findFirst({ orderBy: { createdAt: "asc" } });
    if (!firm) {
        firm = await prisma_1.prisma.firm.create({ data: { name: "Demo Firm" } });
    }
    const name = req.body?.name ?? "Dev API Key";
    const rawKey = "sk_live_" + crypto_1.default.randomBytes(24).toString("hex");
    const keyHash = await bcryptjs_1.default.hash(rawKey, 10);
    await prisma_1.prisma.apiKey.create({
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
    if (!name)
        return res.status(400).json({ error: "name is required" });
    const rawKey = "sk_live_" + crypto_1.default.randomBytes(24).toString("hex");
    const keyHash = await bcryptjs_1.default.hash(rawKey, 10);
    await prisma_1.prisma.apiKey.create({
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
app.post("/ingest", (0, authScope_1.authWithScope)("ingest"), (0, rateLimitEndpoint_1.rateLimitEndpoint)(60, "ingest"), upload.single("file"), async (req, res) => {
    const firmId = req.firmId;
    const file = req.file;
    const source = req.body?.source || "upload";
    const externalId = req.body?.externalId ? String(req.body.externalId) : null;
    if (!file)
        return res.status(400).json({ error: "Missing file (multipart field name must be 'file')" });
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
    });
    if (!firm)
        return res.status(404).json({ ok: false, error: "Firm not found" });
    // Billing gate: active status OR within trial
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
    if (firm.pageLimitMonthly > 0) {
        const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
        const usageRow = await prisma_1.prisma.usageMonthly.findUnique({
            where: { firmId_yearMonth: { firmId, yearMonth: ym } },
            select: { pagesProcessed: true },
        });
        const currentPages = usageRow?.pagesProcessed ?? 0;
        if (currentPages >= firm.pageLimitMonthly) {
            return res.status(402).json({
                ok: false,
                error: "Monthly limit exceeded",
                pagesProcessed: currentPages,
                pageLimitMonthly: firm.pageLimitMonthly,
            });
        }
    }
    const fileSha256 = crypto_1.default.createHash("sha256").update(file.buffer).digest("hex");
    const fileSizeBytes = file.buffer.length;
    const duplicatesEnabled = await (0, featureFlags_1.hasFeature)(firmId, "duplicates_detection");
    if (duplicatesEnabled) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const existing = await prisma_1.prisma.document.findFirst({
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
            await prisma_1.prisma.usageMonthly.upsert({
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
            await prisma_1.prisma.document.update({
                where: { id: existing.id },
                data: { duplicateMatchCount: { increment: 1 } },
            });
            const doc = await prisma_1.prisma.document.create({
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
            });
        }
    }
    const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
    const key = `${firmId}/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.${ext}`;
    await (0, storage_2.putObject)(key, file.buffer, file.mimetype || "application/octet-stream");
    const doc = await prisma_1.prisma.document.create({
        data: {
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
    await (0, queue_1.enqueueDocumentJob)({ documentId: doc.id, firmId });
    res.json({ ok: true, documentId: doc.id, spacesKey: key });
});
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
// === Firm-scoped endpoints ===
// Audit events list for dashboard /dashboard/audit
app.get("/me/audit-events", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
        const events = await prisma_1.prisma.documentAuditEvent.findMany({
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Notifications (key events: settlement offer, timeline updated, narrative generated)
app.get("/me/notifications", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const limit = Math.min(parseInt(String(req.query.limit), 10) || 30, 100);
        const unreadOnly = req.query.unread === "true";
        const items = await (0, notifications_1.listNotifications)(firmId, { limit, unreadOnly });
        const unreadCount = await (0, notifications_1.getUnreadCount)(firmId);
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.patch("/me/notifications/:id/read", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const ok = await (0, notifications_1.markNotificationRead)(firmId, id);
        if (!ok)
            return res.status(404).json({ ok: false, error: "Notification not found" });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.patch("/me/notifications/read-all", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        if (body.firmId && body.firmId !== firmId) {
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        }
        const count = await (0, notifications_1.markAllNotificationsRead)(firmId);
        res.json({ ok: true, markedCount: count });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Metrics summary: single fast endpoint for dashboard counters (firm-scoped)
app.get("/me/metrics-summary", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const now = new Date();
        const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
        const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        const trendStart = new Date(monthStart);
        trendStart.setUTCDate(trendStart.getUTCDate() - 30);
        const [usageRow, unmatchedCount, needsReviewCount, recordsThisMonth, unreadCount] = await Promise.all([
            prisma_1.prisma.usageMonthly.findUnique({
                where: { firmId_yearMonth: { firmId, yearMonth: ym } },
                select: { docsProcessed: true, pagesProcessed: true },
            }),
            prisma_1.prisma.document.count({ where: { firmId, status: "UNMATCHED" } }),
            prisma_1.prisma.document.count({ where: { firmId, status: "NEEDS_REVIEW" } }),
            prisma_1.prisma.recordsRequest.count({
                where: { firmId, createdAt: { gte: monthStart, lte: monthEnd } },
            }),
            (0, notifications_1.getUnreadCount)(firmId),
        ]);
        // 30-day trend: docs and records per day (simple sparkline data)
        const [docsByDay, recordsByDay] = await Promise.all([
            pg_1.pgPool.query(`select to_char(date("processedAt"), 'YYYY-MM-DD') as day, count(*)::int as count
         from "Document"
         where "firmId" = $1 and "processedAt" is not null
           and "processedAt" >= $2 and "processedAt" <= $3
         group by date("processedAt")
         order by day`, [firmId, trendStart, monthEnd]),
            pg_1.pgPool.query(`select to_char(date("createdAt"), 'YYYY-MM-DD') as day, count(*)::int as count
         from "RecordsRequest"
         where "firmId" = $1
           and "createdAt" >= $2 and "createdAt" <= $3
         group by date("createdAt")
         order by day`, [firmId, trendStart, monthEnd]),
        ]);
        const docsMap = new Map(docsByDay.rows.map((r) => [String(r.day), Number(r.count)]));
        const recordsMap = new Map(recordsByDay.rows.map((r) => [String(r.day), Number(r.count)]));
        const trend = [];
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
    }
    catch (e) {
        console.error("Failed to get metrics summary", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Overdue tasks (for dedicated overdue-tasks page)
app.get("/me/overdue-tasks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const now = new Date();
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const tasks = await prisma_1.prisma.caseTask.findMany({
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Needs Attention: actionable items for dashboard (firm-scoped where applicable)
app.get("/me/needs-attention", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const now = new Date();
        const [unmatchedDocs, failedDocs, overdueTasks, recordsWithFailedAttempts, systemErrors] = await Promise.all([
            prisma_1.prisma.document.findMany({
                where: { firmId, status: "UNMATCHED" },
                select: { id: true, originalName: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 5,
            }),
            prisma_1.prisma.document.findMany({
                where: { firmId, status: "FAILED" },
                select: { id: true, originalName: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 5,
            }),
            prisma_1.prisma.caseTask.findMany({
                where: {
                    firmId,
                    completedAt: null,
                    dueDate: { lt: now },
                },
                select: { id: true, title: true, dueDate: true, caseId: true },
                orderBy: { dueDate: "asc" },
                take: 5,
            }),
            prisma_1.prisma.recordsRequest.findMany({
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
            prisma_1.prisma.systemErrorLog.findMany({
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { id: true, service: true, message: true, createdAt: true },
            }),
        ]);
        const [unmatchedCount, failedCount, overdueCount, recordsNeedingFollowUpCount, systemErrorCount] = await Promise.all([
            prisma_1.prisma.document.count({ where: { firmId, status: "UNMATCHED" } }),
            prisma_1.prisma.document.count({ where: { firmId, status: "FAILED" } }),
            prisma_1.prisma.caseTask.count({
                where: { firmId, completedAt: null, dueDate: { lt: now } },
            }),
            prisma_1.prisma.recordsRequest.count({
                where: {
                    firmId,
                    attempts: { some: { ok: false } },
                },
            }),
            prisma_1.prisma.systemErrorLog.count(),
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
    }
    catch (e) {
        console.error("Failed to get needs-attention", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Overdue tasks (for dashboard overdue-tasks page)
app.get("/me/overdue-tasks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const now = new Date();
        const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
        const limit = Math.min(Math.max(1, parseInt(String(limitRaw ?? "100"), 10) || 100), 200);
        const tasks = await prisma_1.prisma.caseTask.findMany({
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
    }
    catch (e) {
        console.error("Failed to get overdue tasks", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Current month usage + firm plan info (all UsageMonthly counters for metering)
app.get("/me/usage", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = req.firmId;
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, name: true, plan: true, pageLimitMonthly: true, retentionDays: true, status: true },
    });
    if (!firm)
        return res.status(404).json({ ok: false, error: "Firm not found" });
    const usageRow = await prisma_1.prisma.usageMonthly.findUnique({
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
            updatedAt: null,
        };
    const monthsParam = Array.isArray(req.query.months) ? req.query.months[0] : req.query.months;
    const monthsCount = Math.min(Math.max(parseInt(String(monthsParam ?? "0"), 10) || 0, 0), 24);
    let usageByMonth = [];
    if (monthsCount > 0) {
        const rows = await prisma_1.prisma.usageMonthly.findMany({
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
app.get("/billing/status", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const now = new Date();
        const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const firm = await prisma_1.prisma.firm.findUnique({
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
        if (!firm)
            return res.status(404).json({ ok: false, error: "Firm not found" });
        const usageRow = await prisma_1.prisma.usageMonthly.findUnique({
            where: { firmId_yearMonth: { firmId, yearMonth: ym } },
            select: { pagesProcessed: true, docsProcessed: true },
        });
        res.json({
            ok: true,
            firm: {
                id: firm.id,
                name: firm.name,
                plan: firm.plan,
                pageLimitMonthly: firm.pageLimitMonthly,
                billingStatus: firm.billingStatus,
                trialEndsAt: firm.trialEndsAt?.toISOString() ?? null,
            },
            usage: {
                yearMonth: ym,
                pagesProcessed: usageRow?.pagesProcessed ?? 0,
                docsProcessed: usageRow?.docsProcessed ?? 0,
            },
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Dev-only: simulate upgrade (plan, pageLimitMonthly, billingStatus)
app.post("/billing/simulate/upgrade", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ ok: false, error: "Not found" });
    }
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        const data = {};
        if (typeof body.plan === "string" && body.plan.trim())
            data.plan = body.plan.trim();
        if (typeof body.pageLimitMonthly === "number" && body.pageLimitMonthly >= 0)
            data.pageLimitMonthly = body.pageLimitMonthly;
        if (typeof body.billingStatus === "string" && body.billingStatus.trim())
            data.billingStatus = body.billingStatus.trim();
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ ok: false, error: "Provide plan, pageLimitMonthly, or billingStatus" });
        }
        const firm = await prisma_1.prisma.firm.update({
            where: { id: firmId },
            data,
            select: { id: true, plan: true, pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
        });
        res.json({ ok: true, firm });
    }
    catch (e) {
        if (e?.code === "P2025")
            return res.status(404).json({ ok: false, error: "Firm not found" });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Firm usage (current month + limit) - alias for plan enforcement
app.get("/firm/usage", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = req.firmId;
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, name: true, plan: true, pageLimitMonthly: true, retentionDays: true, status: true },
    });
    if (!firm)
        return res.status(404).json({ ok: false, error: "Firm not found" });
    const usageRow = await prisma_1.prisma.usageMonthly.findUnique({
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
// Latest documents (cursor pagination)
app.get("/me/documents", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = req.firmId;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
    const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "25"), 10) || 25, 1), 100);
    const cursor = cursorRaw ? String(cursorRaw) : null;
    const docs = await prisma_1.prisma.document.findMany({
        where: { firmId },
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
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    const docIds = page.map((d) => d.id);
    const lastAudit = docIds.length > 0
        ? await prisma_1.prisma.documentAuditEvent.findMany({
            where: { documentId: { in: docIds }, firmId },
            orderBy: { createdAt: "desc" },
        })
        : [];
    const lastAuditByDoc = new Map();
    for (const e of lastAudit) {
        if (!lastAuditByDoc.has(e.documentId))
            lastAuditByDoc.set(e.documentId, e.action);
    }
    const recRows = docIds.length > 0
        ? await pg_1.pgPool.query(`select document_id, insurance_fields, court_fields, match_confidence, match_reason, insights, summary from document_recognition where document_id = any($1)`, [docIds])
        : { rows: [] };
    const insuranceByDoc = new Map();
    const recognitionByDoc = new Map();
    for (const r of recRows.rows) {
        const raw = r.insurance_fields;
        if (raw != null && typeof raw === "object" && "settlementOffer" in raw) {
            const v = raw.settlementOffer;
            insuranceByDoc.set(r.document_id, {
                settlementOffer: typeof v === "number" && Number.isFinite(v) ? v : null,
            });
        }
        else {
            insuranceByDoc.set(r.document_id, null);
        }
        const insights = r.insights != null
            ? Array.isArray(r.insights)
                ? r.insights
                : r.insights?.insights ?? []
            : [];
        const summaryRaw = r.summary;
        const summaryStr = summaryRaw != null && typeof summaryRaw === "object" && "summary" in summaryRaw
            ? summaryRaw.summary ?? null
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
        if (!insuranceByDoc.has(id))
            insuranceByDoc.set(id, null);
        if (!recognitionByDoc.has(id))
            recognitionByDoc.set(id, null);
    }
    const items = page.map((d) => ({
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
        insuranceFields: insuranceByDoc.get(d.id) ?? null,
        recognition: recognitionByDoc.get(d.id) ?? null,
    }));
    res.json({ items, nextCursor });
});
// Review queue: documents with recognition data for UI (cursor pagination)
// Only show docs that need review: routingStatus is null or "needs_review"
app.get("/me/review-queue", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
        const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
        const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "50"), 10) || 50, 1), 100);
        const cursor = cursorRaw ? String(cursorRaw) : null;
        const docs = await prisma_1.prisma.document.findMany({
            where: {
                firmId,
                status: { in: ["NEEDS_REVIEW", "UPLOADED"] },
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
            },
        });
        const hasMore = docs.length > limit;
        const page = hasMore ? docs.slice(0, limit) : docs;
        const nextCursor = hasMore ? page[page.length - 1].id : null;
        const docIds = page.map((d) => d.id);
        const { rows: recRows } = docIds.length > 0
            ? await pg_1.pgPool.query(`select document_id, case_number, client_name, suggested_case_id, doc_type, confidence as doc_type_confidence, match_confidence, match_reason, summary, risks, insights, insurance_fields, court_fields from document_recognition where document_id = any($1)`, [docIds])
            : { rows: [] };
        const recByDoc = new Map(recRows.map((r) => [r.document_id ?? "", r]));
        const claimed = await prisma_1.prisma.documentAuditEvent.findMany({
            where: {
                documentId: { in: docIds },
                firmId,
                action: "claimed",
            },
            orderBy: { createdAt: "desc" },
        });
        const lastClaimByDoc = new Map();
        for (const e of claimed) {
            if (!lastClaimByDoc.has(e.documentId))
                lastClaimByDoc.set(e.documentId, e.actor);
        }
        const lastAudit = await prisma_1.prisma.documentAuditEvent.findMany({
            where: { documentId: { in: docIds }, firmId },
            orderBy: { createdAt: "desc" },
        });
        const lastAuditByDoc = new Map();
        for (const e of lastAudit) {
            if (!lastAuditByDoc.has(e.documentId))
                lastAuditByDoc.set(e.documentId, e.action);
        }
        function routingRecommendation(matchConf, suggestedCaseId) {
            const c = matchConf != null ? Number(matchConf) : null;
            if (c != null && c >= 0.9 && suggestedCaseId)
                return "route";
            if (c != null && c < 0.4)
                return "reject";
            if (c == null && !suggestedCaseId)
                return "reject";
            return "review_manually";
        }
        const items = page.map((d) => {
            const rec = recByDoc.get(d.id);
            const suggestedCaseId = rec?.suggested_case_id ?? null;
            const docType = d.extractedFields?.docType ?? rec?.doc_type ?? null;
            const risks = rec?.risks != null ? (Array.isArray(rec.risks) ? rec.risks : rec.risks?.risks ?? []) : [];
            const insights = rec?.insights != null ? (Array.isArray(rec.insights) ? rec.insights : rec.insights?.insights ?? []) : [];
            const caseMatchConfidence = rec?.match_confidence != null ? Number(rec.match_confidence) : d.confidence;
            const docTypeConfidence = rec?.doc_type_confidence != null ? Number(rec.doc_type_confidence) : null;
            const matchReason = rec?.match_reason ?? null;
            const recommendation = routingRecommendation(caseMatchConfidence, suggestedCaseId);
            const summaryPayload = rec?.summary != null
                ? typeof rec.summary === "object"
                    ? rec.summary
                    : (() => {
                        try {
                            return JSON.parse(String(rec.summary));
                        }
                        catch {
                            return null;
                        }
                    })()
                : null;
            return {
                id: d.id,
                fileName: d.originalName,
                clientName: rec?.client_name ?? d.extractedFields?.clientName ?? null,
                suggestedCaseId,
                routedCaseId: d.routedCaseId,
                matchConfidence: caseMatchConfidence,
                matchReason,
                docTypeConfidence,
                routingRecommendation: recommendation,
                extractedFields: d.extractedFields,
                docType,
                createdAt: d.createdAt,
                claimedBy: lastClaimByDoc.get(d.id) ?? null,
                routingStatus: d.routingStatus ?? null,
                lastAuditAction: lastAuditByDoc.get(d.id) ?? null,
                risks,
                insights,
                summary: summaryPayload,
                insuranceFields: rec?.insurance_fields ?? null,
                duplicateOfId: d.duplicateOfId ?? null,
            };
        });
        res.json({ items, nextCursor });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Global search across cases, documents, providers, records requests (and optionally notes/tasks)
app.get("/me/search", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
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
        const ilike = { contains: q, mode: "insensitive" };
        const [cases, documents, providers, recordsRequests, notes, tasks] = await Promise.all([
            prisma_1.prisma.legalCase.findMany({
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
            prisma_1.prisma.document.findMany({
                where: { firmId, originalName: ilike },
                select: { id: true, originalName: true, routedCaseId: true },
                take: 20,
                orderBy: { ingestedAt: "desc" },
            }),
            prisma_1.prisma.provider.findMany({
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
            prisma_1.prisma.recordsRequest.findMany({
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
                ? prisma_1.prisma.caseNote.findMany({
                    where: { firmId, body: ilike },
                    select: { id: true, body: true, caseId: true },
                    take: 20,
                    orderBy: { createdAt: "desc" },
                })
                : Promise.resolve([]),
            includeTasks
                ? prisma_1.prisma.caseTask.findMany({
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
    }
    catch (e) {
        console.error("Global search failed", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Feature flags for add-ons (insurance_extraction, court_extraction, demand_narratives)
app.get("/me/features", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const [insurance_extraction, court_extraction, demand_narratives, duplicates_detection, crm_sync, crm_push, case_insights] = await Promise.all([
            (0, featureFlags_1.hasFeature)(firmId, "insurance_extraction"),
            (0, featureFlags_1.hasFeature)(firmId, "court_extraction"),
            (0, featureFlags_1.hasFeature)(firmId, "demand_narratives"),
            (0, featureFlags_1.hasFeature)(firmId, "duplicates_detection"),
            (0, featureFlags_1.hasFeature)(firmId, "crm_sync"),
            (0, featureFlags_1.hasFeature)(firmId, "crm_push"),
            (0, featureFlags_1.hasFeature)(firmId, "case_insights"),
        ]);
        res.json({ insurance_extraction, court_extraction, demand_narratives, duplicates_detection, crm_sync, crm_push, case_insights });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/me/settings", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const firm = await prisma_1.prisma.firm.findUnique({
            where: { id: firmId },
            select: { settings: true },
        });
        const settings = firm?.settings ?? {};
        res.json(settings);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.patch("/me/settings", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        const firm = await prisma_1.prisma.firm.findUnique({
            where: { id: firmId },
            select: { settings: true },
        });
        const current = firm?.settings ?? {};
        const next = { ...current, ...body };
        await prisma_1.prisma.firm.update({
            where: { id: firmId },
            data: { settings: next },
        });
        res.json(next);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/** Test CRM webhook (no case required). Requires crm_push feature. Logs to CrmPushLog with caseId "test". */
app.post("/me/crm-push-test", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const result = await (0, pushService_1.pushCrmWebhook)({
            firmId,
            caseId: "test",
            title: "CRM Webhook Test",
            bodyMarkdown: "This is a **test message** from Doc Platform. If you see this, your webhook URL is configured correctly.",
            meta: { actionType: "push_test" },
        });
        if (result.ok) {
            res.json({ ok: true, message: "Test message sent." });
        }
        else {
            const isConfig = result.error?.toLowerCase().includes("not configured");
            res.status(isConfig ? 400 : 502).json({ ok: false, error: result.error });
        }
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Routing rules (auto-route) ===
const MIN_AUTO_ROUTE_CONFIDENCE_MIN = 0.5;
const MIN_AUTO_ROUTE_CONFIDENCE_MAX = 0.99;
const DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE = 0.9;
function clampMinAutoRouteConfidence(v) {
    return Math.max(MIN_AUTO_ROUTE_CONFIDENCE_MIN, Math.min(MIN_AUTO_ROUTE_CONFIDENCE_MAX, v));
}
app.get("/routing-rule", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const [rule, firm] = await Promise.all([
            prisma_1.prisma.routingRule.findUnique({
                where: { firmId },
                select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
            }),
            prisma_1.prisma.firm.findUnique({
                where: { id: firmId },
                select: { settings: true },
            }),
        ]);
        const settings = firm?.settings ?? {};
        const autoRoutedThisMonth = await prisma_1.prisma.documentAuditEvent.count({
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
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.patch("/routing-rule", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        const autoRouteEnabled = body.autoRouteEnabled;
        const rawConf = body.minAutoRouteConfidence;
        const minAutoRouteConfidence = typeof rawConf === "number" ? clampMinAutoRouteConfidence(rawConf) : undefined;
        const autoCreateCaseFromDoc = body.autoCreateCaseFromDoc;
        const [rule, firm] = await Promise.all([
            prisma_1.prisma.routingRule.upsert({
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
            prisma_1.prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } }),
        ]);
        if (autoCreateCaseFromDoc !== undefined) {
            const current = firm?.settings ?? {};
            await prisma_1.prisma.firm.update({
                where: { id: firmId },
                data: { settings: { ...current, autoCreateCaseFromDoc } },
            });
        }
        const settings = firm?.settings ?? {};
        res.json({
            ...rule,
            autoCreateCaseFromDoc: autoCreateCaseFromDoc !== undefined ? autoCreateCaseFromDoc : settings.autoCreateCaseFromDoc === true,
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/me/routing-rules", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const rule = await prisma_1.prisma.routingRule.findUnique({
            where: { firmId },
            select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
        });
        const autoRoutedThisMonth = await prisma_1.prisma.documentAuditEvent.count({
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
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.patch("/me/routing-rules", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        const autoRouteEnabled = body.autoRouteEnabled;
        const rawConf = body.minAutoRouteConfidence;
        const minAutoRouteConfidence = typeof rawConf === "number" ? clampMinAutoRouteConfidence(rawConf) : undefined;
        const rule = await prisma_1.prisma.routingRule.upsert({
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
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/firms/:firmId/routing-rules", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const authFirmId = req.firmId;
        const firmId = String(req.params.firmId ?? "");
        if (authFirmId !== firmId) {
            return res.status(403).json({ error: "Forbidden" });
        }
        let rule = await prisma_1.prisma.routingRule.findUnique({
            where: { firmId },
            select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
        });
        if (!rule) {
            rule = await prisma_1.prisma.routingRule.create({
                data: { firmId, minAutoRouteConfidence: DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE, autoRouteEnabled: false },
                select: { minAutoRouteConfidence: true, autoRouteEnabled: true },
            });
        }
        res.json(rule);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.patch("/firms/:firmId/routing-rules", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const authFirmId = req.firmId;
        const firmId = String(req.params.firmId ?? "");
        if (authFirmId !== firmId) {
            return res.status(403).json({ error: "Forbidden" });
        }
        const body = (req.body ?? {});
        const autoRouteEnabled = body.autoRouteEnabled;
        const rawConf = body.minAutoRouteConfidence;
        const minAutoRouteConfidence = typeof rawConf === "number" ? clampMinAutoRouteConfidence(rawConf) : undefined;
        const rule = await prisma_1.prisma.routingRule.upsert({
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
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
// === Provider directory ===
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
app.get("/providers/search", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
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
        const where = {
            firmId,
            lat: { not: null },
            lng: { not: null },
        };
        if (city)
            where.city = city;
        if (specialty)
            where.specialty = specialty;
        let providers = await prisma_1.prisma.provider.findMany({
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
            providers = providers.filter((p) => p.lat != null && p.lng != null && haversineKm(centerLat, centerLng, p.lat, p.lng) <= radiusKm);
        }
        res.json({ ok: true, items: providers });
    }
    catch (err) {
        console.error("Failed to search providers", err);
        res.status(500).json({ ok: false, error: "Failed to search providers" });
    }
});
app.get("/providers/map", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
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
        const where = {
            firmId,
            lat: { not: null },
            lng: { not: null },
        };
        if (city)
            where.city = city;
        if (specialty)
            where.specialty = specialty;
        let providers = await prisma_1.prisma.provider.findMany({
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
            providers = providers.filter((p) => p.lat != null && p.lng != null && haversineKm(centerLat, centerLng, p.lat, p.lng) <= radiusKm);
        }
        res.json({ ok: true, items: providers });
    }
    catch (err) {
        console.error("Failed to list providers for map", err);
        res.status(500).json({ ok: false, error: "Failed to list providers for map" });
    }
});
app.get("/providers", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
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
        const where = {
            firmId,
        };
        if (onlyWithGeo) {
            where.lat = { not: null };
            where.lng = { not: null };
        }
        if (city)
            where.city = city;
        if (state)
            where.state = state;
        if (specialty)
            where.specialty = specialty;
        if (q) {
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { state: { contains: q, mode: "insensitive" } },
                { specialty: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
            ];
        }
        const providers = await prisma_1.prisma.provider.findMany({
            where,
            orderBy: { name: "asc" },
        });
        res.json({ items: providers });
    }
    catch (err) {
        console.error("Failed to list providers", err);
        res.status(500).json({ error: "Failed to list providers" });
    }
});
app.get("/providers/:id/cases", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const providerId = String(req.params.id ?? "");
        const provider = await prisma_1.prisma.provider.findFirst({
            where: { id: providerId, firmId },
            select: { id: true },
        });
        if (!provider) {
            return res.status(404).json({ error: "Provider not found" });
        }
        const links = await prisma_1.prisma.caseProvider.findMany({
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
    }
    catch (err) {
        console.error("Failed to list provider cases", err);
        res.status(500).json({ error: "Failed to list provider cases" });
    }
});
app.get("/providers/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const provider = await prisma_1.prisma.provider.findFirst({
            where: { id, firmId },
        });
        if (!provider) {
            return res.status(404).json({ error: "Provider not found" });
        }
        res.json(provider);
    }
    catch (err) {
        console.error("Failed to get provider", err);
        res.status(500).json({ error: "Failed to get provider" });
    }
});
// Provider summary: profile + related cases, records requests, timeline events
app.get("/providers/:id/summary", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const provider = await prisma_1.prisma.provider.findFirst({
            where: { id, firmId },
        });
        if (!provider) {
            return res.status(404).json({ error: "Provider not found" });
        }
        const [caseLinks, recordsRequests, timelineEvents] = await Promise.all([
            prisma_1.prisma.caseProvider.findMany({
                where: { firmId, providerId: id },
                include: {
                    case: { select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true } },
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            prisma_1.prisma.recordsRequest.findMany({
                where: { firmId, providerId: id },
                select: { id: true, providerName: true, status: true, caseId: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 20,
            }),
            prisma_1.prisma.caseTimelineEvent.findMany({
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
    }
    catch (err) {
        console.error("Failed to get provider summary", err);
        res.status(500).json({ error: "Failed to get provider summary" });
    }
});
app.post("/providers", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        const { name, address, city, state, phone, fax, email, specialty, specialtiesJson, lat, lng } = body;
        if (!name || !address || !city || !state) {
            return res.status(400).json({ error: "name, address, city, and state are required" });
        }
        const created = await prisma_1.prisma.provider.create({
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
    }
    catch (err) {
        console.error("Failed to create provider", err);
        res.status(500).json({ error: "Failed to create provider" });
    }
});
app.patch("/providers/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const existing = await prisma_1.prisma.provider.findFirst({
            where: { id, firmId },
        });
        if (!existing) {
            return res.status(404).json({ error: "Provider not found" });
        }
        const updated = await prisma_1.prisma.provider.update({
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
    }
    catch (err) {
        console.error("Failed to update provider", err);
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Provider not found" });
        }
        res.status(500).json({ error: "Failed to update provider" });
    }
});
// ----- Provider account auth (firm admin invites, provider login, provider self-service) -----
app.post("/providers/:id/invites", auth_1.auth, requireAdminOrFirmAdminForProvider_1.requireAdminOrFirmAdminForProvider, async (req, res) => {
    try {
        const providerId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ ok: false, error: "email is required" });
        }
        const provider = await prisma_1.prisma.provider.findUnique({
            where: { id: providerId },
        });
        if (!provider) {
            return res.status(404).json({ ok: false, error: "Provider not found" });
        }
        const existing = await prisma_1.prisma.providerAccount.findUnique({
            where: { email },
        });
        if (existing) {
            return res.status(400).json({ ok: false, error: "An account with this email already exists" });
        }
        const rawToken = crypto_1.default.randomBytes(32).toString("hex");
        const tokenHash = crypto_1.default.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma_1.prisma.providerInvite.create({
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
    }
    catch (err) {
        console.error("Failed to create provider invite", err);
        res.status(500).json({ ok: false, error: "Failed to create invite" });
    }
});
app.post("/provider/auth/login", async (req, res) => {
    try {
        const body = (req.body ?? {});
        const email = String(body.email ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");
        if (!email || !password) {
            return res.status(400).json({ ok: false, error: "email and password are required" });
        }
        const account = await prisma_1.prisma.providerAccount.findUnique({
            where: { email },
            include: { provider: true },
        });
        if (!account) {
            return res.status(401).json({ ok: false, error: "Invalid email or password" });
        }
        const valid = await bcryptjs_1.default.compare(password, account.passwordHash);
        if (!valid) {
            return res.status(401).json({ ok: false, error: "Invalid email or password" });
        }
        (0, providerSession_1.createProviderSession)(res, account.id);
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
    }
    catch (err) {
        console.error("Provider login failed", err);
        res.status(500).json({ ok: false, error: "Login failed" });
    }
});
app.post("/provider/auth/logout", (_req, res) => {
    (0, providerSession_1.clearProviderSession)(res);
    res.json({ ok: true });
});
app.get("/provider/me", providerSession_1.requireProviderSession, async (req, res) => {
    const account = req.providerAccount;
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
app.patch("/provider/me/provider", providerSession_1.requireProviderSession, async (req, res) => {
    try {
        const providerId = req.providerId;
        const body = (req.body ?? {});
        const updateData = {};
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
                }
                else if (key === "specialtiesJson") {
                    updateData[key] = body[key];
                }
                else {
                    updateData[key] = body[key];
                }
            }
        }
        const updated = await prisma_1.prisma.provider.update({
            where: { id: providerId },
            data: updateData,
        });
        res.json(updated);
    }
    catch (err) {
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
    const tokenHash = crypto_1.default.createHash("sha256").update(token).digest("hex");
    const invite = await prisma_1.prisma.providerInvite.findFirst({
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
        const body = (req.body ?? {});
        const token = String(body.token ?? "").trim();
        const password = String(body.password ?? "");
        if (!token || !password || password.length < 8) {
            return res.status(400).json({ ok: false, error: "token and password (min 8 chars) are required" });
        }
        const tokenHash = crypto_1.default.createHash("sha256").update(token).digest("hex");
        const invite = await prisma_1.prisma.providerInvite.findFirst({
            where: { tokenHash },
            include: { provider: true },
        });
        if (!invite || invite.usedAt) {
            return res.status(400).json({ ok: false, error: "Invalid or expired invite" });
        }
        if (invite.expiresAt < new Date()) {
            return res.status(400).json({ ok: false, error: "Invite has expired" });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const account = await prisma_1.prisma.$transaction(async (tx) => {
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
        (0, providerSession_1.createProviderSession)(res, account.id);
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
    }
    catch (err) {
        if (err?.code === "P2002") {
            return res.status(400).json({ ok: false, error: "An account with this email already exists" });
        }
        console.error("Failed to accept invite", err);
        res.status(500).json({ ok: false, error: "Failed to create account" });
    }
});
// ----- End provider account auth -----
async function addDocumentAuditEvent(input) {
    const { firmId, documentId, actor, action, fromCaseId, toCaseId, metaJson } = input;
    try {
        await prisma_1.prisma.documentAuditEvent.create({
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
    }
    catch (err) {
        console.error("[audit] failed to insert audit event", { err, firmId, documentId, action });
    }
}
// Bulk document actions (assign case, mark unmatched, mark needs review)
app.patch("/documents/bulk", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const actor = req.apiKeyPrefix || "reviewer";
        const body = (req.body ?? {});
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
        const docs = await prisma_1.prisma.document.findMany({
            where: { id: { in: documentIds }, firmId },
            select: { id: true, routedCaseId: true },
        });
        const foundIds = new Set(docs.map((d) => d.id));
        const notFound = documentIds.filter((id) => !foundIds.has(id));
        if (notFound.length > 0) {
            return res.status(404).json({ ok: false, error: `Documents not found or not in your firm: ${notFound.join(", ")}` });
        }
        if (action === "assign_case" && caseId) {
            const caseRow = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
            if (!caseRow)
                return res.status(404).json({ ok: false, error: "Case not found" });
        }
        let updated = 0;
        for (const doc of docs) {
            try {
                if (action === "assign_case" && caseId) {
                    await (0, documentRouting_1.routeDocument)(firmId, doc.id, caseId, {
                        actor,
                        action: "bulk_routed",
                        routedSystem: "manual",
                        routingStatus: "routed",
                        metaJson: { bulk: true },
                    });
                    updated++;
                }
                else if (action === "mark_unmatched") {
                    await prisma_1.prisma.document.update({
                        where: { id: doc.id },
                        data: { status: "UNMATCHED", routedCaseId: null, routedSystem: null, routingStatus: null },
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
                }
                else if (action === "mark_needs_review") {
                    await prisma_1.prisma.document.update({
                        where: { id: doc.id },
                        data: { status: "NEEDS_REVIEW", routingStatus: "needs_review" },
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
            }
            catch (e) {
                console.warn("[documents/bulk] failed for doc", doc.id, e);
            }
        }
        res.json({ ok: true, updated });
    }
    catch (e) {
        console.error("[documents/bulk]", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/documents/:id/recognize", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        // Fetch document storage key from Document table (firm-scoped to prevent IDOR)
        const { rows } = await pg_1.pgPool.query(`
      select "spacesKey" as key, "mimeType" as mime_type
      from "Document"
      where id = $1 and "firmId" = $2
      limit 1
      `, [documentId, firmId]);
        if (!rows.length) {
            return res.status(404).json({ ok: false, error: "document not found / no key" });
        }
        const key = rows[0].key;
        const mimeType = rows[0].mime_type || "";
        const isPdf = mimeType === "application/pdf" ||
            (key.toLowerCase().endsWith(".pdf"));
        if (!isPdf) {
            return res.status(400).json({
                ok: false,
                error: "Document is not a PDF; recognition is only supported for PDFs",
            });
        }
        const bytes = await (0, storage_1.getObjectBuffer)(key);
        const text = await (0, docRecognition_1.extractTextFromPdf)(bytes);
        console.log("[recognize]", {
            documentId,
            spacesKey: key,
            extractedTextLength: text.length,
        });
        const result = (0, docRecognition_1.classifyAndExtract)(text);
        const classification = (0, docClassifier_1.classify)(text, key.split("/").pop() ?? "");
        let finalDocType = classification.docType !== "unknown" ? classification.docType : result.docType;
        const finalConfidence = classification.docType !== "unknown" ? classification.confidence : result.confidence;
        const [insuranceOn, courtOn] = await Promise.all([
            (0, featureFlags_1.hasFeature)(firmId, "insurance_extraction"),
            (0, featureFlags_1.hasFeature)(firmId, "court_extraction"),
        ]);
        if ((finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_")) && !insuranceOn)
            finalDocType = "other";
        if ((finalDocType === "court_filing" || finalDocType.startsWith("court_")) && !courtOn)
            finalDocType = "other";
        const baseFields = {
            docType: finalDocType,
            caseNumber: result.caseNumber,
            clientName: result.clientName,
            incidentDate: result.incidentDate,
            excerptLength: (result.excerpt || "").length,
        };
        const extractedFields = (0, extractors_1.runExtractors)(text, finalDocType, baseFields);
        const { risks } = (0, riskAnalyzer_1.analyzeRisks)(text);
        const risksJson = risks.length > 0 ? JSON.stringify(risks) : null;
        const { insights } = (0, documentInsights_1.analyzeDocumentInsights)(text);
        const insightsJson = insights.length > 0 ? JSON.stringify(insights) : null;
        const { summary: summaryText, keyFacts } = await (0, documentSummary_1.summarizeDocument)(text);
        const summaryJson = summaryText || keyFacts.length > 0 ? JSON.stringify({ summary: summaryText, keyFacts }) : null;
        const insuranceFieldsJson = insuranceOn && (finalDocType === "insurance_letter" || finalDocType.startsWith("insurance_"))
            ? JSON.stringify(await (0, insuranceOfferExtractor_1.extractInsuranceOfferFields)({ text, fileName: key.split("/").pop() ?? undefined }))
            : null;
        const courtFieldsJson = courtOn && (finalDocType === "court_filing" || finalDocType.startsWith("court_"))
            ? JSON.stringify(await (0, courtExtractor_1.extractCourtFields)({ text, fileName: key.split("/").pop() ?? undefined }))
            : null;
        await pg_1.pgPool.query(`
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
      `, [
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
        ]);
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true },
        });
        if (doc) {
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { extractedFields: extractedFields, confidence: finalConfidence },
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Manual reprocess: Retry processing (full), Retry OCR, or Rebuild extraction
app.post("/documents/:id/reprocess", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const actor = req.apiKeyPrefix ?? "api";
        const body = (req.body ?? {});
        const mode = (String(body.mode ?? "full").toLowerCase() || "full");
        if (!["full", "ocr", "extraction"].includes(mode)) {
            return res.status(400).json({ ok: false, error: "mode must be full, ocr, or extraction" });
        }
        const doc = await prisma_1.prisma.document.findFirst({
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
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { status: "PROCESSING", processingStage: "uploaded" },
            });
            await (0, queue_1.enqueueOcrJob)({ documentId, firmId });
        }
        else {
            // mode === "extraction": requires existing recognition data
            const { rows } = await pg_1.pgPool.query(`select document_id, text_excerpt, doc_type from document_recognition where document_id = $1`, [documentId]);
            if (!rows[0]?.text_excerpt || !rows[0]?.doc_type) {
                return res.status(400).json({
                    ok: false,
                    error: "Run recognition or OCR first; document has no text_excerpt or doc_type",
                });
            }
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { status: "PROCESSING", processingStage: "extraction" },
            });
            await (0, queue_1.enqueueExtractionJob)({ documentId, firmId });
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
    }
    catch (e) {
        (0, errorLog_1.logSystemError)("api", e).catch(() => { });
        const firmId = req.firmId;
        const documentId = String(req.params?.id ?? "");
        if (firmId && documentId) {
            addDocumentAuditEvent({
                firmId,
                documentId,
                actor: "system",
                action: "reprocess_failed",
                fromCaseId: null,
                toCaseId: null,
                metaJson: { error: String(e?.message || e) },
            }).catch(() => { });
        }
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Re-run case matching for a document (requires existing recognition)
app.post("/documents/:id/rematch", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const actor = req.apiKeyPrefix ?? "api";
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, routedCaseId: true },
        });
        if (!doc) {
            return res.status(404).json({ ok: false, error: "document not found" });
        }
        const { rows: recRows } = await pg_1.pgPool.query(`select document_id, case_number, client_name from document_recognition where document_id = $1`, [documentId]);
        const rec = recRows[0];
        if (!rec) {
            return res.status(400).json({ ok: false, error: "Run recognition first" });
        }
        const signals = {
            caseNumber: rec.case_number ?? null,
            clientName: rec.client_name ?? null,
        };
        const match = await (0, caseMatching_1.matchDocumentToCase)(firmId, signals, doc.routedCaseId);
        await pg_1.pgPool.query(`update document_recognition set match_confidence = $1, match_reason = $2, suggested_case_id = $4, updated_at = now() where document_id = $3`, [match.matchConfidence, match.matchReason, documentId, match.caseId]);
        const updateData = {};
        if (match.matchConfidence > 0.9 && match.caseId) {
            updateData.status = "UPLOADED";
            updateData.routedCaseId = match.caseId;
        }
        else if (match.matchConfidence >= 0.5) {
            updateData.status = "NEEDS_REVIEW";
            updateData.routedCaseId = match.caseId ?? null;
        }
        else {
            updateData.status = "NEEDS_REVIEW";
            updateData.routedCaseId = null;
        }
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: updateData,
        });
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Reprocess document: retry full pipeline, OCR only, or extraction only
app.post("/documents/:id/reprocess", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const actor = req.apiKeyPrefix ?? "api";
        const body = (req.body ?? {});
        const mode = String(body.mode ?? "full").toLowerCase();
        const validModes = ["full", "ocr", "extraction"];
        if (!validModes.includes(mode)) {
            return res.status(400).json({
                ok: false,
                error: `mode must be one of: ${validModes.join(", ")}`,
            });
        }
        const doc = await prisma_1.prisma.document.findFirst({
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
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { status: "PROCESSING", processingStage: "uploaded" },
            });
            await (0, queue_1.enqueueOcrJob)({ documentId, firmId });
        }
        else {
            // mode === "extraction"
            const { rows } = await pg_1.pgPool.query(`select document_id from document_recognition where document_id = $1 and text_excerpt is not null and doc_type is not null`, [documentId]);
            if (!rows.length) {
                return res.status(400).json({
                    ok: false,
                    error: "Document has no recognition data. Run retry processing or retry OCR first.",
                });
            }
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { status: "PROCESSING", processingStage: "extraction" },
            });
            await (0, queue_1.enqueueExtractionJob)({ documentId, firmId });
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
    }
    catch (e) {
        const errMsg = String(e?.message ?? e);
        (0, errorLog_1.logSystemError)("api", errMsg, e?.stack).catch(() => { });
        res.status(500).json({ ok: false, error: errMsg });
    }
});
app.post("/documents/:id/approve", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const actor = req.apiKeyPrefix || "reviewer";
        const body = (req.body ?? {});
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, routedCaseId: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
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
                await (0, caseTimeline_1.rebuildCaseTimeline)(doc.routedCaseId, firmId);
            }
            catch (e) {
                console.error("[timeline] rebuild after approve failed", { caseId: doc.routedCaseId, err: e });
            }
            (0, pushService_1.pushCaseIntelligenceToCrm)({
                firmId,
                caseId: doc.routedCaseId,
                actionType: "document_approved",
                documentId,
            }).catch((e) => console.warn("[crm] push after approve failed", e));
        }
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/documents/:id/reject", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const actor = req.apiKeyPrefix || "reviewer";
        const body = (req.body ?? {});
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, routedCaseId: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/documents/:id/route", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const actor = req.apiKeyPrefix || "reviewer";
        const body = (req.body ?? {});
        const toCaseId = body?.caseId ? String(body.caseId) : null;
        const result = await (0, documentRouting_1.routeDocument)(firmId, documentId, toCaseId, {
            actor,
            action: "routed",
            routedSystem: "manual",
            routingStatus: toCaseId ? "routed" : null,
            metaJson: body ?? null,
        });
        if (!result.ok) {
            return res.status(404).json({ ok: false, error: result.error });
        }
        if (toCaseId) {
            const crmSyncEnabled = await (0, featureFlags_1.hasFeature)(firmId, "crm_sync");
            if (crmSyncEnabled) {
                try {
                    const firm = await prisma_1.prisma.firm.findUnique({
                        where: { id: firmId },
                        select: { settings: true },
                    });
                    const settings = firm?.settings;
                    if (settings?.crm === "clio") {
                        const doc = await prisma_1.prisma.document.findFirst({
                            where: { id: documentId, firmId },
                            select: { spacesKey: true, originalName: true },
                        });
                        if (doc?.spacesKey) {
                            const fileUrl = await (0, storage_3.getPresignedGetUrl)(doc.spacesKey);
                            const pushResult = await (0, clioAdapter_1.pushDocumentToClio)({
                                firmId,
                                caseId: toCaseId,
                                documentId,
                                fileName: doc.originalName || documentId,
                                fileUrl,
                            });
                            if (!pushResult.ok) {
                                console.warn("[route] Clio push failed:", pushResult.error);
                            }
                        }
                    }
                }
                catch (e) {
                    console.warn("[route] CRM sync error:", e);
                }
            }
            (0, pushService_1.pushCaseIntelligenceToCrm)({
                firmId,
                caseId: toCaseId,
                actionType: "document_routed",
                documentId,
            }).catch((e) => console.warn("[crm] push after route failed", e));
        }
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/documents/:id/claim", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const user = body?.user || body?.claimedBy || "unknown";
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, routedCaseId: true, status: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
        // Simple idempotent semantics: if already claimed by someone else, return 409
        const existingEvents = await prisma_1.prisma.documentAuditEvent.findMany({
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/documents/:id/unclaim", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const user = body?.user || body?.claimedBy || "unknown";
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, routedCaseId: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/documents/:id/download", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { spacesKey: true, mimeType: true, originalName: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
        const url = await (0, storage_3.getPresignedGetUrl)(doc.spacesKey, 3600);
        res.json({ ok: true, url, originalName: doc.originalName });
    }
    catch (e) {
        console.error("Failed to get download URL", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.patch("/documents/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const actor = req.apiKeyPrefix || "reviewer";
        const body = (req.body ?? {});
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, status: true, routedCaseId: true, routingStatus: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
        if (body.routedCaseId !== undefined) {
            const toCaseId = body.routedCaseId === null || body.routedCaseId === "" ? null : String(body.routedCaseId).trim();
            if (toCaseId) {
                const caseRow = await prisma_1.prisma.legalCase.findFirst({ where: { id: toCaseId, firmId }, select: { id: true } });
                if (!caseRow)
                    return res.status(404).json({ ok: false, error: "case not found" });
                const result = await (0, documentRouting_1.routeDocument)(firmId, documentId, toCaseId, {
                    actor,
                    action: "routed",
                    routedSystem: "manual",
                    routingStatus: "routed",
                    metaJson: { source: "patch" },
                });
                if (!result.ok)
                    return res.status(400).json({ ok: false, error: result.error });
                const updated = await prisma_1.prisma.document.findFirst({ where: { id: documentId, firmId } });
                return res.json(updated);
            }
            await prisma_1.prisma.document.update({
                where: { id: documentId },
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
            const updated = await prisma_1.prisma.document.findFirst({ where: { id: documentId, firmId } });
            return res.json(updated);
        }
        const updates = {};
        if (body.status !== undefined) {
            const validStatuses = ["RECEIVED", "PROCESSING", "NEEDS_REVIEW", "UPLOADED", "FAILED", "UNMATCHED"];
            if (validStatuses.includes(String(body.status))) {
                updates.status = body.status;
            }
        }
        if (body.routingStatus !== undefined) {
            updates.routingStatus = body.routingStatus === null || body.routingStatus === "" ? null : String(body.routingStatus);
            if (updates.routingStatus === "needs_review")
                updates.status = "NEEDS_REVIEW";
        }
        if (Object.keys(updates).length > 0) {
            await prisma_1.prisma.document.update({ where: { id: documentId }, data: updates });
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
        const updated = await prisma_1.prisma.document.findFirst({ where: { id: documentId, firmId } });
        res.json(updated);
    }
    catch (e) {
        console.error("Failed to patch document", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/documents/:id/preview", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, mimeType: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
        // Only serve preview for PDFs for now
        const mime = doc.mimeType || "";
        if (mime !== "application/pdf") {
            return res.status(415).json({ ok: false, error: "preview only supported for PDFs" });
        }
        // Placeholder: 1x1 transparent PNG. Replace with real PDF thumbnail rendering.
        const transparentPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
        const buf = Buffer.from(transparentPngBase64, "base64");
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(buf);
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/documents/:id/duplicates", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, duplicateOfId: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
        let original = null;
        let duplicates = [];
        if (doc.duplicateOfId) {
            const orig = await prisma_1.prisma.document.findFirst({
                where: { id: doc.duplicateOfId, firmId },
                select: { id: true, originalName: true },
            });
            if (orig)
                original = { id: orig.id, originalName: orig.originalName };
        }
        const dups = await prisma_1.prisma.document.findMany({
            where: { firmId, duplicateOfId: documentId },
            select: { id: true, originalName: true },
            orderBy: { ingestedAt: "desc" },
        });
        duplicates = dups.map((d) => ({ id: d.id, originalName: d.originalName }));
        res.json({ ok: true, original, duplicates });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
async function getDocumentAuditEvents(req, res) {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const events = await prisma_1.prisma.documentAuditEvent.findMany({
            where: { documentId, firmId },
            orderBy: { createdAt: "asc" },
        });
        res.json({ ok: true, items: events });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
}
app.get("/documents/:id/audit", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), getDocumentAuditEvents);
app.get("/documents/:id/audit-events", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), getDocumentAuditEvents);
app.get("/cases/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const c = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true },
        });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        res.json({ ok: true, item: c });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/cases/:id/audit", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const events = await prisma_1.prisma.documentAuditEvent.findMany({
            where: {
                firmId,
                OR: [{ fromCaseId: caseId }, { toCaseId: caseId }],
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        res.json({ ok: true, items: events });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/cases/:id/insights", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const allowed = await (0, featureFlags_1.hasFeature)(firmId, "case_insights");
        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "Case insights add-on is not enabled for this firm.",
            });
        }
        const result = await (0, caseInsights_1.getCaseInsights)(caseId, firmId);
        const items = result.insights.map((insight) => ({
            type: insight.type,
            severity: insight.severity,
            title: insight.summary,
            detail: insight.detail ?? null,
            sourceDocumentIds: insight.documentIds ?? [],
        }));
        res.json({ ok: true, insights: items });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/cases/:id/report", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const caseExists = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true },
        });
        if (!caseExists) {
            return res.status(404).json({ ok: false, error: "Case not found." });
        }
        const pdfBuffer = await (0, caseReportPdf_1.buildCaseReportPdf)(caseId, firmId);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="case-report-${caseId}.pdf"`);
        res.send(pdfBuffer);
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/fetch-docket", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const allowed = await (0, featureFlags_1.hasFeature)(firmId, "court_extraction");
        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "Court extraction add-on is not enabled for this firm.",
            });
        }
        const legalCase = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true, caseNumber: true },
        });
        if (!legalCase) {
            return res.status(404).json({ ok: false, error: "Case not found" });
        }
        const caseNumber = legalCase.caseNumber?.trim() || caseId;
        const result = await (0, docketFetcher_1.fetchCourtDocket)(caseNumber, firmId, legalCase.id);
        res.json({ ok: true, imported: result.imported });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
function parseISODate(s) {
    if (!s || typeof s !== "string")
        return null;
    const d = new Date(s.trim());
    return isNaN(d.getTime()) ? null : d;
}
app.get("/cases/:id/timeline-meta", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const row = await prisma_1.prisma.caseTimelineRebuild.findUnique({
            where: { caseId_firmId: { caseId, firmId } },
            select: { rebuiltAt: true },
        });
        res.json({ ok: true, lastRebuiltAt: row?.rebuiltAt ?? null });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/cases/:id/timeline", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
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
        const where = { caseId, firmId };
        if (track)
            where.track = track;
        if (provider)
            where.provider = { contains: provider, mode: "insensitive" };
        if (dateFrom ?? dateTo) {
            where.eventDate = {};
            if (dateFrom)
                where.eventDate.gte = dateFrom;
            if (dateTo)
                where.eventDate.lte = dateTo;
        }
        const events = await prisma_1.prisma.caseTimelineEvent.findMany({
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/timeline/rebuild", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const caseExists = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true },
        });
        if (!caseExists) {
            return res.status(404).json({ ok: false, error: "Case not found." });
        }
        await (0, queue_1.enqueueTimelineRebuildJob)({ caseId, firmId });
        res.status(202).json({ ok: true, queued: true, message: "Timeline rebuild queued." });
    }
    catch (e) {
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
];
const NARRATIVE_TONES = ["neutral", "assertive", "aggressive"];
app.post("/cases/:id/narrative", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), (0, rateLimitEndpoint_1.rateLimitEndpoint)(20, "narrative"), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const allowed = await (0, featureFlags_1.hasFeature)(firmId, "demand_narratives");
        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "Demand narratives add-on is not enabled for this firm.",
            });
        }
        const body = (req.body ?? {});
        const narrativeTypeRaw = body?.narrativeType ?? body?.type;
        const toneRaw = body?.tone;
        const type = NARRATIVE_TYPES.includes(narrativeTypeRaw) ? narrativeTypeRaw : "treatment_summary";
        const tone = NARRATIVE_TONES.includes(toneRaw) ? toneRaw : "neutral";
        const notes = body?.notes != null ? String(body.notes) : undefined;
        const questionnaire = body?.questionnaire != null && typeof body.questionnaire === "object" ? body.questionnaire : undefined;
        const internalType = type === "denial_response" ? "response_to_denial" : type;
        const caseExists = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true },
        });
        if (!caseExists) {
            return res.status(404).json({ ok: false, error: "Case not found." });
        }
        const result = await (0, narrativeAssistant_1.generateNarrative)({
            caseId,
            firmId,
            type: internalType,
            tone,
            notes,
            questionnaire,
        });
        const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
        await prisma_1.prisma.usageMonthly.upsert({
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
        (0, notifications_1.createNotification)(firmId, "narrative_generated", "Narrative generated", `Demand narrative (${type}) was generated for this case.`, { caseId, narrativeType: type }).catch((e) => console.warn("[notifications] narrative_generated failed", e));
        (0, pushService_1.pushCaseIntelligenceToCrm)({
            firmId,
            caseId,
            actionType: "narrative_generated",
            narrativeExcerpt: result.text,
        }).catch((e) => console.warn("[crm] push after narrative failed", e));
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/rebuild-timeline", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const caseExists = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true },
        });
        if (!caseExists) {
            return res.status(404).json({ ok: false, error: "Case not found." });
        }
        await (0, queue_1.enqueueTimelineRebuildJob)({ caseId, firmId });
        res.status(202).json({ ok: true, queued: true, message: "Timeline rebuild queued." });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/push-test", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const caseExists = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true },
        });
        if (!caseExists) {
            return res.status(404).json({ ok: false, error: "Case not found" });
        }
        const result = await (0, pushService_1.pushCrmWebhook)({
            firmId,
            caseId,
            title: "Case Intelligence Update (Test)",
            bodyMarkdown: "This is a **test message** from Doc Platform. If you see this, your webhook is configured correctly.",
            meta: { actionType: "push_test" },
        });
        if (result.ok) {
            res.json({ ok: true, message: "Test message sent." });
        }
        else {
            const isConfig = result.error?.toLowerCase().includes("not configured");
            res.status(isConfig ? 400 : 502).json({ ok: false, error: result.error });
        }
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Case ↔ Provider linkage ===
app.get("/cases/:id/providers", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        const links = await prisma_1.prisma.caseProvider.findMany({
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
    }
    catch (e) {
        console.error("Failed to list case providers", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/providers", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const providerId = body.providerId ? String(body.providerId) : "";
        if (!providerId)
            return res.status(400).json({ error: "providerId is required" });
        const rel = String(body.relationship ?? "").toLowerCase();
        const relationship = ["treating", "referral", "lien", "records_only"].includes(rel) ? rel : "treating";
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        const p = await prisma_1.prisma.provider.findFirst({ where: { id: providerId, firmId }, select: { id: true } });
        if (!p)
            return res.status(404).json({ error: "Provider not found" });
        const created = await prisma_1.prisma.caseProvider.upsert({
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
    }
    catch (e) {
        console.error("Failed to attach provider to case", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.delete("/cases/:id/providers/:providerId", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const providerId = String(req.params.providerId ?? "");
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        const deleted = await prisma_1.prisma.caseProvider.deleteMany({
            where: { firmId, caseId, providerId },
        });
        if (deleted.count === 0)
            return res.status(404).json({ error: "Provider not linked to this case" });
        res.json({ ok: true });
    }
    catch (e) {
        if (e?.code === "P2025")
            return res.status(404).json({ error: "Provider not linked to this case" });
        console.error("Failed to detach provider from case", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Records requests ===
app.post("/cases/:id/records-requests", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const { providerId, providerName, providerContact, dateFrom, dateTo, notes } = body;
        let name = providerName ? String(providerName) : "";
        let contact = providerContact != null ? String(providerContact) : null;
        if (providerId) {
            const provider = await prisma_1.prisma.provider.findFirst({
                where: { id: String(providerId), firmId },
            });
            if (provider) {
                if (!name)
                    name = provider.name;
                if (contact == null) {
                    const parts = [provider.address, `${provider.city}, ${provider.state}`];
                    if (provider.phone)
                        parts.push(`Phone: ${provider.phone}`);
                    if (provider.fax)
                        parts.push(`Fax: ${provider.fax}`);
                    if (provider.email)
                        parts.push(`Email: ${provider.email}`);
                    contact = parts.join("\n");
                }
            }
        }
        if (!name) {
            return res.status(400).json({ error: "providerName or providerId is required" });
        }
        const created = await prisma_1.prisma.recordsRequest.create({
            data: {
                firmId,
                caseId,
                providerId: providerId ? String(providerId) : null,
                providerName: name,
                providerContact: contact,
                dateFrom: dateFrom ? new Date(dateFrom) : null,
                dateTo: dateTo ? new Date(dateTo) : null,
                notes: notes ? String(notes) : null,
                status: "Draft",
            },
        });
        // Auto-generate letter text using AI (case + provider info)
        const letterResult = await (0, recordsLetterGenerator_1.generateRecordsRequestLetter)({
            caseId,
            firmId,
            providerName: name,
            providerContact: contact,
            dateFrom: created.dateFrom,
            dateTo: created.dateTo,
            notes: created.notes,
        });
        if (letterResult.text) {
            await prisma_1.prisma.recordsRequest.update({
                where: { id: created.id },
                data: { letterBody: letterResult.text },
            });
            created.letterBody = letterResult.text;
        }
        if (letterResult.error) {
            created.letterError = letterResult.error;
        }
        res.status(201).json({ ok: true, item: created });
    }
    catch (e) {
        console.error("Failed to create records request", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/cases/:id/records-requests", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const items = await prisma_1.prisma.recordsRequest.findMany({
            where: { firmId, caseId },
            orderBy: { createdAt: "desc" },
        });
        res.json({ ok: true, items });
    }
    catch (e) {
        console.error("Failed to list records requests", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Case offers (settlement offers aggregated over time) ===
app.get("/cases/:id/offers", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        const { rows } = await pg_1.pgPool.query(`select d.id as document_id, d.original_name, d.created_at, d.processed_at,
              (dr.insurance_fields->>'settlementOffer')::float as amount
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d.firm_id = $1 and d.routed_case_id = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d.processed_at, d.created_at) desc`, [firmId, caseId]);
        const offers = rows.map((r) => ({
            documentId: r.document_id,
            originalName: r.original_name,
            date: (r.processed_at ?? r.created_at).toISOString(),
            amount: Number(r.amount),
        }));
        const latest = offers.length > 0 ? offers[0] : null;
        res.json({ ok: true, offers, latest });
    }
    catch (e) {
        console.error("Failed to list case offers", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/cases/:id/offers/export-pdf", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const c = await prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true, caseNumber: true, clientName: true },
        });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        const { rows } = await pg_1.pgPool.query(`select d.id as document_id, d.original_name, d.created_at, d.processed_at,
              (dr.insurance_fields->>'settlementOffer')::float as amount
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d.firm_id = $1 and d.routed_case_id = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d.processed_at, d.created_at) desc`, [firmId, caseId]);
        const offers = rows.map((r) => ({
            documentId: r.document_id,
            originalName: r.original_name,
            date: (r.processed_at ?? r.created_at).toISOString(),
            amount: Number(r.amount),
        }));
        const pdf = await (0, offersSummaryPdf_1.buildOffersSummaryPdf)({
            caseNumber: c.caseNumber,
            clientName: c.clientName,
            offers,
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="offers-${c.caseNumber || caseId}.pdf"`);
        res.send(pdf);
    }
    catch (e) {
        console.error("Failed to export offers PDF", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Case documents ===
app.get("/cases/:id/documents", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : null;
        if (qFirmId && qFirmId !== firmId) {
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        }
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        const items = await prisma_1.prisma.document.findMany({
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
        res.json({ ok: true, items });
    }
    catch (e) {
        console.error("Failed to list case documents", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/documents/attach", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const actor = req.apiKeyPrefix || "user";
        const caseId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const documentId = body.documentId ? String(body.documentId) : "";
        if (!documentId)
            return res.status(400).json({ error: "documentId is required" });
        if (body.firmId && body.firmId !== firmId) {
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        }
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ ok: false, error: "Case not found" });
        const result = await (0, documentRouting_1.routeDocument)(firmId, documentId, caseId, {
            actor,
            action: "attached_to_case",
            routedSystem: "manual",
            routingStatus: "routed",
        });
        if (!result.ok)
            return res.status(404).json({ ok: false, error: result.error });
        const updated = await prisma_1.prisma.document.findUnique({
            where: { id: documentId },
            select: { id: true, originalName: true, status: true, createdAt: true, pageCount: true },
        });
        res.status(201).json({ ok: true, item: updated });
    }
    catch (e) {
        console.error("Failed to attach document to case", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/documents/upload", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), upload.single("file"), async (req, res) => {
    try {
        const firmId = req.firmId;
        const actor = req.apiKeyPrefix || "user";
        const caseId = String(req.params.id ?? "");
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: "Missing file (multipart field name must be 'file')" });
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ ok: false, error: "Case not found" });
        const firm = await prisma_1.prisma.firm.findUnique({
            where: { id: firmId },
            select: { pageLimitMonthly: true, billingStatus: true, trialEndsAt: true },
        });
        if (!firm)
            return res.status(404).json({ ok: false, error: "Firm not found" });
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
        if (firm.pageLimitMonthly > 0) {
            const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
            const usageRow = await prisma_1.prisma.usageMonthly.findUnique({
                where: { firmId_yearMonth: { firmId, yearMonth: ym } },
                select: { pagesProcessed: true },
            });
            const currentPages = usageRow?.pagesProcessed ?? 0;
            if (currentPages >= firm.pageLimitMonthly) {
                return res.status(402).json({
                    ok: false,
                    error: "Monthly limit exceeded",
                    pagesProcessed: currentPages,
                    pageLimitMonthly: firm.pageLimitMonthly,
                });
            }
        }
        const fileSha256 = crypto_1.default.createHash("sha256").update(file.buffer).digest("hex");
        const fileSizeBytes = file.buffer.length;
        const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
        const key = `${firmId}/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.${ext}`;
        await (0, storage_2.putObject)(key, file.buffer, file.mimetype || "application/octet-stream");
        const doc = await prisma_1.prisma.document.create({
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
        await (0, queue_1.enqueueDocumentJob)({ documentId: doc.id, firmId });
        await (0, queue_1.enqueueTimelineRebuildJob)({ caseId, firmId });
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
    }
    catch (e) {
        console.error("Failed to upload document to case", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/documents", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const documentId = body.documentId ? String(body.documentId) : "";
        if (!documentId)
            return res.status(400).json({ error: "documentId is required" });
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ error: "Case not found" });
        const result = await (0, documentRouting_1.routeDocument)(firmId, documentId, caseId, {
            actor: req.apiKeyPrefix || "user",
            action: "attached_to_case",
            routedSystem: "manual",
            routingStatus: "routed",
        });
        if (!result.ok)
            return res.status(404).json({ ok: false, error: result.error });
        const updated = await prisma_1.prisma.document.findUnique({
            where: { id: documentId },
            select: { id: true, originalName: true, status: true, createdAt: true, pageCount: true },
        });
        res.status(201).json({ ok: true, item: updated });
    }
    catch (e) {
        console.error("Failed to attach document to case", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Case tasks (PATCH /cases/tasks/:id must come before /cases/:id to avoid "tasks" as caseId) ===
app.patch("/cases/tasks/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const taskId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        if (typeof body.completed !== "boolean") {
            return res.status(400).json({ ok: false, error: "completed (boolean) is required" });
        }
        if (body.firmId && body.firmId !== firmId) {
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        }
        const existing = await prisma_1.prisma.caseTask.findFirst({
            where: { id: taskId, firmId },
            select: { id: true },
        });
        if (!existing)
            return res.status(404).json({ ok: false, error: "Task not found" });
        const updated = await prisma_1.prisma.caseTask.update({
            where: { id: taskId },
            data: { completedAt: body.completed ? new Date() : null, updatedAt: new Date() },
        });
        res.json({ ok: true, item: updated });
    }
    catch (e) {
        console.error("Failed to update case task", e);
        (0, errorLog_1.logSystemError)("api", e).catch(() => { });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Case notes ===
app.get("/cases/:id/notes", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : firmId;
        if (qFirmId !== firmId)
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ ok: false, error: "Case not found" });
        const items = await prisma_1.prisma.caseNote.findMany({
            where: { caseId, firmId },
            orderBy: { createdAt: "desc" },
        });
        res.json({ ok: true, items });
    }
    catch (e) {
        console.error("Failed to list case notes", e);
        (0, errorLog_1.logSystemError)("api", e).catch(() => { });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/notes", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const noteBody = body.body != null ? String(body.body) : "";
        if (!noteBody.trim())
            return res.status(400).json({ ok: false, error: "body is required" });
        if (body.firmId && body.firmId !== firmId)
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ ok: false, error: "Case not found" });
        const created = await prisma_1.prisma.caseNote.create({
            data: { caseId, firmId, body: noteBody.trim(), authorUserId: body.authorUserId || null },
        });
        res.status(201).json({ ok: true, item: created });
    }
    catch (e) {
        console.error("Failed to create case note", e);
        (0, errorLog_1.logSystemError)("api", e).catch(() => { });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// === Case tasks ===
app.get("/cases/:id/tasks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const qFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : firmId;
        if (qFirmId !== firmId)
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ ok: false, error: "Case not found" });
        const items = await prisma_1.prisma.caseTask.findMany({
            where: { caseId, firmId },
            orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        });
        res.json({ ok: true, items });
    }
    catch (e) {
        console.error("Failed to list case tasks", e);
        (0, errorLog_1.logSystemError)("api", e).catch(() => { });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/cases/:id/tasks", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const title = body.title != null ? String(body.title).trim() : "";
        if (!title)
            return res.status(400).json({ ok: false, error: "title is required" });
        if (body.firmId && body.firmId !== firmId)
            return res.status(403).json({ ok: false, error: "firmId mismatch" });
        const c = await prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { id: true } });
        if (!c)
            return res.status(404).json({ ok: false, error: "Case not found" });
        const dueDate = body.dueDate ? new Date(body.dueDate) : null;
        const created = await prisma_1.prisma.caseTask.create({
            data: { caseId, firmId, title, dueDate },
        });
        res.status(201).json({ ok: true, item: created });
    }
    catch (e) {
        console.error("Failed to create case task", e);
        (0, errorLog_1.logSystemError)("api", e).catch(() => { });
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/records-requests/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const item = await prisma_1.prisma.recordsRequest.findFirst({
            where: { id, firmId },
        });
        if (!item) {
            return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
        }
        const caseRow = await prisma_1.prisma.legalCase.findUnique({
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
    }
    catch (e) {
        console.error("Failed to get records request", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.patch("/records-requests/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const existing = await prisma_1.prisma.recordsRequest.findFirst({
            where: { id, firmId },
        });
        if (!existing) {
            return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
        }
        const data = {};
        if (body.status)
            data.status = String(body.status);
        if (body.notes !== undefined)
            data.notes = body.notes === null ? null : String(body.notes);
        if (body.dateFrom !== undefined)
            data.dateFrom = body.dateFrom ? new Date(body.dateFrom) : null;
        if (body.dateTo !== undefined)
            data.dateTo = body.dateTo ? new Date(body.dateTo) : null;
        if (body.letterBody !== undefined)
            data.letterBody = body.letterBody === null ? null : String(body.letterBody);
        const updated = await prisma_1.prisma.recordsRequest.update({
            where: { id },
            data,
        });
        res.json({ ok: true, item: updated });
    }
    catch (e) {
        console.error("Failed to update records request", e);
        if (e?.code === "P2025") {
            return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
        }
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/records-requests/:id/generate-pdf", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const reqRow = await prisma_1.prisma.recordsRequest.findFirst({
            where: { id, firmId },
        });
        if (!reqRow) {
            return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
        }
        const letterBody = reqRow.letterBody ?? "";
        if (!letterBody.trim()) {
            return res.status(400).json({ ok: false, error: "Letter body is empty; save the letter first" });
        }
        const pdfBuffer = await (0, recordsLetterPdf_1.buildRecordsRequestLetterPdf)({
            letterBody,
            providerName: reqRow.providerName,
            providerContact: reqRow.providerContact,
        });
        const safeName = reqRow.providerName.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Records Request";
        const originalName = `Records Request - ${safeName}.pdf`;
        const fileSha256 = crypto_1.default.createHash("sha256").update(pdfBuffer).digest("hex");
        const key = `${firmId}/records_request/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.pdf`;
        await (0, storage_2.putObject)(key, pdfBuffer, "application/pdf");
        const doc = await prisma_1.prisma.document.create({
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
        await prisma_1.prisma.recordsRequest.update({
            where: { id },
            data: { generatedDocumentId: doc.id },
        });
        (0, notifications_1.createNotification)(firmId, "records_request_pdf_generated", "Records request PDF generated", `Records request letter for ${reqRow.providerName} was saved as a document.`, { caseId: reqRow.caseId, documentId: doc.id, recordsRequestId: id }).catch((e) => console.warn("[notifications] records_request_pdf_generated failed", e));
        res.json({ ok: true, documentId: doc.id });
    }
    catch (e) {
        console.error("Failed to generate records request PDF", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/records-requests/:id/letter", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const formatPdf = req.query.format === "pdf" ||
            /application\/pdf/i.test(String(req.headers?.accept ?? ""));
        const reqRow = await prisma_1.prisma.recordsRequest.findFirst({
            where: { id, firmId },
        });
        if (!reqRow) {
            return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
        }
        const today = new Date();
        const fmt = (d) => (d ? d.toLocaleDateString("en-US") : "");
        const dateFromStr = reqRow.dateFrom ? fmt(reqRow.dateFrom) : "";
        const dateToStr = reqRow.dateTo ? fmt(reqRow.dateTo) : "";
        const rangeStr = dateFromStr && dateToStr
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
            const pdfBuffer = await (0, recordsLetterPdf_1.buildRecordsRequestLetterPdf)({
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
    }
    catch (e) {
        console.error("Failed to generate records request letter", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/records-requests/:id/send", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const channel = String(body.channel ?? "").toLowerCase();
        const to = String(body.to ?? "").trim();
        if (!["email", "fax"].includes(channel)) {
            return res.status(400).json({ ok: false, error: "channel must be email or fax" });
        }
        if (!to) {
            return res
                .status(400)
                .json({
                ok: false,
                error: channel === "email" ? "to (email address) is required" : "to (fax number) is required",
            });
        }
        const reqRow = await prisma_1.prisma.recordsRequest.findFirst({
            where: { id, firmId },
        });
        if (!reqRow) {
            return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
        }
        const letterBody = reqRow.letterBody ?? "";
        if (!letterBody.trim()) {
            return res.status(400).json({ ok: false, error: "Letter body is empty; save the letter first" });
        }
        const pdfBuffer = await (0, recordsLetterPdf_1.buildRecordsRequestLetterPdf)({
            letterBody,
            providerName: reqRow.providerName,
            providerContact: reqRow.providerContact,
        });
        let result;
        if (channel === "email") {
            const safeName = reqRow.providerName.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Records Request";
            const subject = `Medical Records Request - ${reqRow.providerName}`;
            const textBody = letterBody;
            result = await compositeAdapter_1.sendAdapter.sendEmail(to, subject, textBody, [
                { filename: `records-request-${safeName}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
            ]);
        }
        else {
            result = await compositeAdapter_1.sendAdapter.sendFax(to, pdfBuffer);
        }
        await prisma_1.prisma.crmPushLog.create({
            data: {
                firmId,
                caseId: reqRow.caseId,
                documentId: null,
                actionType: "records_request_send",
                provider: channel,
                ok: result.ok,
                error: result.error ?? null,
            },
        });
        await prisma_1.prisma.recordsRequestAttempt.create({
            data: {
                firmId,
                recordsRequestId: id,
                channel,
                destination: to,
                ok: result.ok,
                error: result.error ?? null,
                externalId: result.externalId ?? null,
            },
        });
        if (!result.ok) {
            return res.status(500).json({ ok: false, error: result.error || "Send failed" });
        }
        await prisma_1.prisma.recordsRequest.update({
            where: { id },
            data: { status: "Sent" },
        });
        (0, notifications_1.createNotification)(firmId, "records_request_sent", "Records request sent", `Records request for ${reqRow.providerName} was sent via ${channel} to ${to}.`, { caseId: reqRow.caseId, recordsRequestId: id, channel, to }).catch((e) => console.warn("[notifications] records_request_sent failed", e));
        res.json({ ok: true, message: `Sent via ${channel} to ${to}` });
    }
    catch (e) {
        console.error("Failed to send records request", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/records-requests/:id/attempts", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const id = String(req.params.id ?? "");
        const reqRow = await prisma_1.prisma.recordsRequest.findFirst({
            where: { id, firmId },
            select: { id: true },
        });
        if (!reqRow) {
            return res.status(404).json({ ok: false, error: "RecordsRequest not found" });
        }
        const items = await prisma_1.prisma.recordsRequestAttempt.findMany({
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
    }
    catch (e) {
        console.error("Failed to list records request attempts", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
app.get("/metrics/review", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const rangeRaw = Array.isArray(req.query.range)
            ? req.query.range[0]
            : req.query.range;
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
        const ingResult = await pg_1.pgPool.query(`
      select date("createdAt") as day, count(*)::int as count
      from "Document"
      where "firmId" = $1
        and "createdAt" between $2 and $3
      group by date("createdAt")
      order by day
      `, [firmId, start, end]);
        // Per-day routed (manual route events)
        const routedResult = await pg_1.pgPool.query(`
      select date("createdAt") as day, count(*)::int as count
      from "DocumentAuditEvent"
      where "firmId" = $1
        and action = 'routed'
        and "createdAt" between $2 and $3
      group by date("createdAt")
      order by day
      `, [firmId, start, end]);
        // Durations between ingest and routed
        const durResult = await pg_1.pgPool.query(`
      select d."createdAt" as created_at, e."createdAt" as routed_at
      from "Document" d
      join "DocumentAuditEvent" e
        on e."documentId" = d.id
       and e."firmId" = d."firmId"
      where d."firmId" = $1
        and e.action = 'routed'
        and e."createdAt" between $2 and $3
      `, [firmId, start, end]);
        const durationsSeconds = durResult.rows
            .map((r) => {
            const createdAt = new Date(r.created_at);
            const routedAt = new Date(r.routed_at);
            const diffMs = routedAt.getTime() - createdAt.getTime();
            return diffMs > 0 ? diffMs / 1000 : null;
        })
            .filter((v) => v != null);
        durationsSeconds.sort((a, b) => a - b);
        let medianSeconds = null;
        if (durationsSeconds.length > 0) {
            const mid = Math.floor(durationsSeconds.length / 2);
            if (durationsSeconds.length % 2 === 0) {
                medianSeconds = (durationsSeconds[mid - 1] + durationsSeconds[mid]) / 2;
            }
            else {
                medianSeconds = durationsSeconds[mid];
            }
        }
        // Current queue size (NEEDS_REVIEW)
        const currentQueueSize = await prisma_1.prisma.document.count({
            where: { firmId, status: "NEEDS_REVIEW" },
        });
        // Top facilities/providers by extractedFields JSON
        const topFacilitiesResult = await pg_1.pgPool
            .query(`
        select coalesce(("extractedFields"->>'facility'), 'Unknown') as facility,
               count(*)::int as count
        from "Document"
        where "firmId" = $1
          and "createdAt" between $2 and $3
        group by facility
        order by count desc
        limit 5
        `, [firmId, start, end])
            .catch(() => ({ rows: [] }));
        const topProvidersResult = await pg_1.pgPool
            .query(`
        select coalesce(("extractedFields"->>'provider'), 'Unknown') as provider,
               count(*)::int as count
        from "Document"
        where "firmId" = $1
          and "createdAt" between $2 and $3
        group by provider
        order by count desc
        limit 5
        `, [firmId, start, end])
            .catch(() => ({ rows: [] }));
        const ingByDay = new Map(ingResult.rows.map((r) => [String(r.day), r.count]));
        const routedByDay = new Map(routedResult.rows.map((r) => [String(r.day), r.count]));
        const perDay = [];
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
                topFacilities: topFacilitiesResult.rows.map((r) => ({
                    facility: r.facility,
                    count: Number(r.count ?? 0),
                })),
                topProviders: topProvidersResult.rows.map((r) => ({
                    provider: r.provider,
                    count: Number(r.count ?? 0),
                })),
            },
            perDay,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Get recognition result for a document (firm-scoped)
app.get("/documents/:id/recognition", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, originalName: true, status: true, routedCaseId: true, routingStatus: true, mimeType: true, confidence: true, extractedFields: true, duplicateMatchCount: true, duplicateOfId: true, pageCount: true, ingestedAt: true },
        });
        if (!doc) {
            return res.status(404).json({ ok: false, error: "document not found" });
        }
        const { rows } = await pg_1.pgPool.query(`select document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, match_confidence, match_reason, risks, insights, insurance_fields, court_fields, updated_at
       from document_recognition where document_id = $1`, [documentId]);
        const rec = rows[0] || null;
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
                    risks: rec.risks != null ? (Array.isArray(rec.risks) ? rec.risks : rec.risks?.risks ?? []) : [],
                    insights: rec.insights != null ? (Array.isArray(rec.insights) ? rec.insights : rec.insights?.insights ?? []) : [],
                    insuranceFields: rec.insurance_fields ?? null,
                    courtFields: rec.court_fields ?? null,
                }
                : null,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/documents/:id/explain", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), (0, rateLimitEndpoint_1.rateLimitEndpoint)(30, "document_explain"), async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const body = (req.body ?? {});
        const question = typeof body.question === "string" ? body.question.trim() : undefined;
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, firmId: true, extractedFields: true },
        });
        if (!doc) {
            return res.status(404).json({ ok: false, error: "document not found" });
        }
        const { rows } = await pg_1.pgPool.query(`select text_excerpt from document_recognition where document_id = $1`, [documentId]);
        const ocrText = rows[0]?.text_excerpt ?? null;
        const result = await (0, documentExplain_1.explainDocument)(ocrText, doc.extractedFields ?? null, question);
        const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
        await prisma_1.prisma.usageMonthly.upsert({
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
    }
    catch (e) {
        console.error("[documents/explain]", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/mailboxes/recent-ingests", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 100);
        const { rows } = await pg_1.pgPool.query(`
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
      `, [firmId, limit]);
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/mailboxes/:id/recent-ingests", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const mailboxId = req.params.id;
        const { rows: mb } = await pg_1.pgPool.query(`select id from mailbox_connections where id = $1 and firm_id = $2 limit 1`, [mailboxId, firmId]);
        if (!mb.length) {
            return res.status(404).json({ ok: false, error: "mailbox not found" });
        }
        const { rows } = await pg_1.pgPool.query(`
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
      `, [mailboxId]);
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/mailboxes/:id/poll-now", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const mailboxId = String(req.params.id ?? "");
        const { rows } = await pg_1.pgPool.query(`select id from mailbox_connections where id = $1 and firm_id = $2 limit 1`, [mailboxId, firmId]);
        if (!rows.length) {
            return res.status(404).json({ ok: false, error: "mailbox not found" });
        }
        const { runEmailPollForMailbox } = await Promise.resolve().then(() => __importStar(require("../email/emailIngestRunner")));
        await runEmailPollForMailbox(mailboxId);
        res.json({ ok: true, message: "Poll completed" });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/mailboxes/:id/test", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const mailboxId = req.params.id;
        const { rows } = await pg_1.pgPool.query(`select id, firm_id, imap_host, imap_port, imap_secure, imap_username, imap_password, folder
       from mailbox_connections where id = $1 and firm_id = $2 limit 1`, [mailboxId, firmId]);
        const mb = rows[0];
        if (!mb || mb.firm_id !== firmId) {
            return res.status(404).json({ ok: false, error: "mailbox not found" });
        }
        if (!mb.imap_host || !mb.imap_username || !mb.imap_password) {
            return res.status(400).json({ ok: false, error: "mailbox missing host/username/password" });
        }
        const result = await (0, imapPoller_1.testImapConnection)({
            host: mb.imap_host,
            port: mb.imap_port || 993,
            secure: mb.imap_secure !== false,
            auth: { user: mb.imap_username, pass: mb.imap_password },
            mailbox: mb.folder || "INBOX",
        });
        if (result.ok) {
            res.json({ ok: true });
        }
        else {
            res.status(400).json({ ok: false, error: result.error });
        }
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.patch("/mailboxes/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const mailboxId = req.params.id;
        const body = (req.body ?? {});
        let status = null;
        if (body.enabled === true)
            status = "active";
        else if (body.enabled === false)
            status = "paused";
        else if (body.status === "paused")
            status = "paused";
        else if (body.status === "active")
            status = "active";
        if (status === null) {
            return res.status(400).json({ error: "Provide status ('active'|'paused') or enabled (boolean)" });
        }
        const { rowCount } = await pg_1.pgPool.query(`update mailbox_connections set status = $1, updated_at = now() where id = $2 and firm_id = $3`, [status, mailboxId, firmId]);
        if (rowCount === 0) {
            return res.status(404).json({ ok: false, error: "mailbox not found" });
        }
        res.json({ ok: true, status });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// POST /mailboxes — create mailbox (API key, firmId from key)
app.post("/mailboxes", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const body = (req.body ?? {});
        if (!body.imapHost?.trim() || !body.imapUsername?.trim() || body.imapPassword == null) {
            return res.status(400).json({
                ok: false,
                error: "imapHost, imapUsername, and imapPassword are required",
            });
        }
        const id = "mb_" + crypto_1.default.randomBytes(12).toString("hex");
        const imapPort = typeof body.imapPort === "number" ? body.imapPort : 993;
        const imapSecure = body.imapSecure !== false;
        const folder = (body.folder ?? "INBOX").toString().trim() || "INBOX";
        await pg_1.pgPool.query(`
      insert into mailbox_connections (id, firm_id, provider, imap_host, imap_port, imap_secure, imap_username, imap_password, folder, status, updated_at)
      values ($1, $2, 'imap', $3, $4, $5, $6, $7, $8, 'active', now())
      `, [id, firmId, body.imapHost.trim(), imapPort, imapSecure, body.imapUsername.trim(), body.imapPassword, folder]);
        const { rows } = await pg_1.pgPool.query(`select id, firm_id, provider, imap_host, imap_port, imap_secure, imap_username, folder, status, updated_at from mailbox_connections where id = $1`, [id]);
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/mailboxes", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    try {
        const firmId = req.firmId;
        const { rows } = await pg_1.pgPool.query(`
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
      `, [firmId]);
        res.json({ ok: true, items: rows });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.use(errorLogMiddleware_1.errorLogMiddleware);
app.listen(port, () => console.log(`API listening on :${port}`));
