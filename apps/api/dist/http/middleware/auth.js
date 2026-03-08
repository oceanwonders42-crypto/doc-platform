"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = auth;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../db/prisma");
const client_1 = require("@prisma/client");
const abuseTracking_1 = require("../../services/abuseTracking");
const jwt_1 = require("../../lib/jwt");
const DEFAULT_MAX_PER_MINUTE = 120;
const WINDOW_MS = 60 * 1000;
const store = new Map();
function getMaxPerMinute() {
    const raw = process.env.RATE_LIMIT_REQUESTS_PER_MINUTE;
    if (raw == null || raw === "")
        return DEFAULT_MAX_PER_MINUTE;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_PER_MINUTE;
}
function checkRateLimit(apiKeyId, requestId) {
    const now = Date.now();
    const max = getMaxPerMinute();
    let w = store.get(apiKeyId);
    if (!w || now >= w.resetAt) {
        w = { count: 0, resetAt: now + WINDOW_MS };
        store.set(apiKeyId, w);
    }
    w.count += 1;
    if (w.count > max) {
        return false;
    }
    return true;
}
function getBearerToken(req) {
    const h = req.header("authorization") || req.header("Authorization");
    if (!h)
        return null;
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}
/**
 * Parse scopes string (e.g. "ingest" or "ingest,admin") into trimmed lowercase set.
 */
function parseScopes(scopes) {
    if (!scopes || typeof scopes !== "string")
        return new Set();
    return new Set(scopes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}
/**
 * Main auth: Bearer API key, PLATFORM_ADMIN_API_KEY, or session (browser cookie).
 * Session: req.session.userId must match a User; firmId/role from User for tenant safety.
 * Sets: req.firmId, req.apiKeyId?, req.userId?, req.authRole, req.authScopes, req.isAdmin?
 */
async function auth(req, res, next) {
    const token = getBearerToken(req);
    const adminKey = process.env.PLATFORM_ADMIN_API_KEY;
    if (adminKey && token && token === adminKey) {
        req.isAdmin = true;
        req.authRole = client_1.Role.PLATFORM_ADMIN;
        req.authScopes = new Set();
        return next();
    }
    if (token) {
        // JWT: when token is not an API key prefix, try JWT (for web Bearer auth)
        if (!token.startsWith(jwt_1.API_KEY_PREFIX)) {
            const payload = (0, jwt_1.verifyToken)(token);
            if (payload) {
                req.firmId = payload.firmId;
                req.userId = payload.userId;
                req.authRole = payload.role;
                req.authScopes = new Set();
                return next();
            }
        }
        const prefix = token.slice(0, 12);
        const candidates = await prisma_1.prisma.apiKey.findMany({
            where: { keyPrefix: prefix, revokedAt: null },
            take: 5,
            select: { id: true, firmId: true, userId: true, keyHash: true, scopes: true },
        });
        for (const k of candidates) {
            const ok = await bcryptjs_1.default.compare(token, k.keyHash);
            if (ok) {
                const requestId = req.requestId;
                if (!checkRateLimit(k.id, requestId)) {
                    res.setHeader("Retry-After", "60");
                    return res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
                }
                await prisma_1.prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
                req.firmId = k.firmId;
                req.apiKeyId = k.id;
                req.authScopes = parseScopes(k.scopes);
                if (k.userId) {
                    const user = await prisma_1.prisma.user.findUnique({
                        where: { id: k.userId },
                        select: { role: true, firmId: true },
                    });
                    req.userId = k.userId;
                    req.authRole = user?.role ?? client_1.Role.STAFF;
                    if (user && user.firmId !== k.firmId) {
                        (0, abuseTracking_1.recordAbuse)({
                            ip: (req.ip || req.socket?.remoteAddress || "unknown").toString(),
                            route: req.originalUrl || req.path || "/",
                            eventType: "tenant_mismatch",
                        });
                        return res.status(403).json({ ok: false, error: "Tenant mismatch", code: "FORBIDDEN" });
                    }
                }
                else {
                    req.userId = null;
                    req.authRole = client_1.Role.STAFF;
                }
                return next();
            }
        }
        const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
        const route = req.originalUrl || req.path || "/";
        (0, abuseTracking_1.recordAbuse)({ ip, route, eventType: "auth_failure" });
        return res.status(401).json({ ok: false, error: "Invalid API key", code: "UNAUTHORIZED" });
    }
    // No Bearer token: try session (browser cookie)
    const sess = req.session;
    const sessionUserId = sess?.userId;
    if (sessionUserId && typeof sessionUserId === "string") {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: sessionUserId },
            select: { id: true, firmId: true, email: true, role: true },
        });
        if (!user) {
            if (typeof req.session?.destroy === "function") {
                req.session.destroy(() => { });
            }
            return res.status(401).json({ ok: false, error: "Session invalid", code: "UNAUTHORIZED" });
        }
        req.firmId = user.firmId;
        req.userId = user.id;
        req.authRole = user.role;
        req.authScopes = new Set();
        return next();
    }
    return res.status(401).json({ ok: false, error: "Missing Authorization or session", code: "UNAUTHORIZED" });
}
