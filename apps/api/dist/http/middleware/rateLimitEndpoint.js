"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitEndpoint = rateLimitEndpoint;
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
