import type { Request, Response, NextFunction } from "express";
import { recordAbuse } from "../../services/abuseTracking";

const WINDOW_MS = 60 * 1000;
const store = new Map<string, { count: number; resetAt: number }>();

/**
 * Returns a middleware that enforces a per-API-key rate limit for a specific endpoint.
 * Must be used after authApiKey so req has apiKeyId. Returns 429 when exceeded.
 */
export function rateLimitEndpoint(maxPerMinute: number, endpointKey: string) {
  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const apiKeyId = (req as any).apiKeyId as string | undefined;
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
      const requestId = (req as any).requestId as string | undefined;
      const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
      recordAbuse({ ip, route: endpointKey, eventType: "rate_limit_hit" });
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

const ipStore = new Map<string, { count: number; resetAt: number }>();

/** Rate limit by IP for unauthenticated or session endpoints (e.g. support form). */
export function rateLimitByIp(maxPerMinute: number, endpointKey: string) {
  return function rateLimit(req: Request, res: Response, next: NextFunction) {
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
      recordAbuse({ ip, route: endpointKey, eventType: "rate_limit_hit" });
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
