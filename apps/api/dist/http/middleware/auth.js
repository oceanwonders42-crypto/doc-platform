"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = auth;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../db/prisma");
const client_1 = require("@prisma/client");
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
 * Main auth: Bearer API key or PLATFORM_ADMIN_API_KEY.
 * (Session user: placeholder for future - check cookies/session after Bearer.)
 * Sets: req.firmId, req.apiKeyId?, req.userId?, req.authRole, req.authScopes, req.isAdmin?
 */
async function auth(req, res, next) {
    const token = getBearerToken(req);
    // TODO: session user - if no Bearer, check req.session?.userId, resolve User+firmId+role
    const adminKey = process.env.PLATFORM_ADMIN_API_KEY;
    if (adminKey && token && token === adminKey) {
        req.isAdmin = true;
        req.authRole = client_1.Role.PLATFORM_ADMIN;
        req.authScopes = new Set();
        return next();
    }
    // Dashboard login: Bearer is a JWT (does not look like an API key)
    if (token && !token.startsWith(jwt_1.API_KEY_PREFIX)) {
        const payload = (0, jwt_1.verifyToken)(token);
        if (payload) {
            req.firmId = payload.firmId;
            req.userId = payload.userId;
            req.authRole = payload.role;
            req.authScopes = new Set();
            return next();
        }
    }
    if (!token) {
        return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <apiKey>" });
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
                    select: { role: true },
                });
                req.userId = k.userId;
                req.authRole = user?.role ?? client_1.Role.STAFF;
            }
            else {
                req.userId = null;
                req.authRole = client_1.Role.STAFF;
            }
            return next();
        }
    }
    return res.status(401).json({ ok: false, error: "Invalid API key" });
}
