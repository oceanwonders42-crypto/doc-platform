/**
 * Auth for scope-limited routes (e.g. ingest).
 * Validates Bearer API key and checks scopes includes the required scope.
 * No role enforcement.
 */
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma";

const DEFAULT_MAX_PER_MINUTE = 120;
const WINDOW_MS = 60 * 1000;
const store = new Map<string, { count: number; resetAt: number }>();

function getMaxPerMinute(): number {
  const raw = process.env.RATE_LIMIT_REQUESTS_PER_MINUTE;
  if (raw == null || raw === "") return DEFAULT_MAX_PER_MINUTE;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_PER_MINUTE;
}

function checkRateLimit(apiKeyId: string, requestId: string | undefined): boolean {
  const now = Date.now();
  const max = getMaxPerMinute();
  let w = store.get(apiKeyId);
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + WINDOW_MS };
    store.set(apiKeyId, w);
  }
  w.count += 1;
  if (w.count > max) return false;
  return true;
}

function getBearerToken(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function parseScopes(scopes: string | null | undefined): Set<string> {
  if (!scopes || typeof scopes !== "string") return new Set();
  return new Set(scopes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Auth for ingest and other scope-only routes.
 * Requires Bearer API key with scopes including the given scope (e.g. "ingest").
 */
export function authWithScope(requiredScope: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <apiKey>" });
    }

    const prefix = token.slice(0, 12);
    const candidates = await prisma.apiKey.findMany({
      where: { keyPrefix: prefix, revokedAt: null },
      take: 5,
      select: { id: true, firmId: true, keyHash: true, scopes: true },
    });

    const scope = requiredScope.toLowerCase().trim();

    for (const k of candidates) {
      const ok = await bcrypt.compare(token, k.keyHash);
      if (ok) {
        const scopes = parseScopes(k.scopes);
        if (!scopes.has(scope)) {
          return res.status(403).json({ ok: false, error: `API key missing required scope: ${requiredScope}` });
        }
        const requestId = (req as any).requestId as string | undefined;
        if (!checkRateLimit(k.id, requestId)) {
          res.setHeader("Retry-After", "60");
          return res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
        }
        await prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
        (req as any).firmId = k.firmId;
        (req as any).apiKeyId = k.id;
        return next();
      }
    }

    return res.status(401).json({ ok: false, error: "Invalid API key" });
  };
}
