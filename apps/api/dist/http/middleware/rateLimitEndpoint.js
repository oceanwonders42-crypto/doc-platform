"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitEndpoint = rateLimitEndpoint;
exports.rateLimitByIp = rateLimitByIp;
const abuseTracking_1 = require("../../services/abuseTracking");
const WINDOW_MS = 60 * 1000;
const store = new Map();
/**
 * Returns a middleware that enforces a per-API-key rate limit for a specific endpoint.
 * Must be used after authApiKey so req has apiKeyId. Returns 429 when exceeded.
 */
function rateLimitEndpoint(maxPerMinute, endpointKey) {
    return function rateLimit(req, res, next) {
        const apiKeyId = req.apiKeyId;
        if (!apiKeyId) {
            return next();
        }
        const key = `${apiKeyId}:${endpointKey}`;
        const now = Date.now();
        let w = store.get(key);
        if (!w || now >= w.resetAt) {
            w = { count: 0, resetAt: now + WINDOW_MS };
            store.set(key, w);
        }
        w.count += 1;
        if (w.count > maxPerMinute) {
            const requestId = req.requestId;
            const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
            (0, abuseTracking_1.recordAbuse)({ ip, route: endpointKey, eventType: "rate_limit_hit" });
            console.warn("[api] endpoint rate limit exceeded", {
                requestId,
                apiKeyId,
                endpointKey,
                count: w.count,
                max: maxPerMinute,
            });
            res.setHeader("Retry-After", "60");
            return res.status(429).json({
                ok: false,
                error: "Too many requests. Try again later.",
            });
        }
        next();
    };
}
const ipStore = new Map();
/** Rate limit by IP for unauthenticated or session endpoints (e.g. support form). */
function rateLimitByIp(maxPerMinute, endpointKey) {
    return function rateLimit(req, res, next) {
        const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
        const key = `${ip}:${endpointKey}`;
        const now = Date.now();
        let w = ipStore.get(key);
        if (!w || now >= w.resetAt) {
            w = { count: 0, resetAt: now + WINDOW_MS };
            ipStore.set(key, w);
        }
        w.count += 1;
        if (w.count > maxPerMinute) {
            const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
            (0, abuseTracking_1.recordAbuse)({ ip, route: endpointKey, eventType: "rate_limit_hit" });
            res.setHeader("Retry-After", "60");
            return res.status(429).json({
                ok: false,
                error: "Too many requests. Try again later.",
                code: "RATE_LIMITED",
            });
        }
        next();
    };
}
