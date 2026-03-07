"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authWithScope = authWithScope;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../db/prisma");
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
    if (w.count > max)
        return false;
    return true;
}
function getBearerToken(req) {
    const h = req.header("authorization") || req.header("Authorization");
    if (!h)
        return null;
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}
function parseScopes(scopes) {
    if (!scopes || typeof scopes !== "string")
        return new Set();
    return new Set(scopes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}
/**
 * Auth for ingest and other scope-only routes.
 * Requires Bearer API key with scopes including the given scope (e.g. "ingest").
 */
function authWithScope(requiredScope) {
    return async (req, res, next) => {
        const token = getBearerToken(req);
        if (!token) {
            return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <apiKey>" });
        }
        const prefix = token.slice(0, 12);
        const candidates = await prisma_1.prisma.apiKey.findMany({
            where: { keyPrefix: prefix, revokedAt: null },
            take: 5,
            select: { id: true, firmId: true, keyHash: true, scopes: true },
        });
        const scope = requiredScope.toLowerCase().trim();
        for (const k of candidates) {
            const ok = await bcryptjs_1.default.compare(token, k.keyHash);
            if (ok) {
                const scopes = parseScopes(k.scopes);
                if (!scopes.has(scope)) {
                    return res.status(403).json({ ok: false, error: `API key missing required scope: ${requiredScope}` });
                }
                const requestId = req.requestId;
                if (!checkRateLimit(k.id, requestId)) {
                    res.setHeader("Retry-After", "60");
                    return res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
                }
                await prisma_1.prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
                req.firmId = k.firmId;
                req.apiKeyId = k.id;
                return next();
            }
        }
        return res.status(401).json({ ok: false, error: "Invalid API key" });
    };
}
