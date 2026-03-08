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
  if (w.count > max) {
    console.warn("[api] rate limit exceeded", { requestId, apiKeyId, count: w.count });
    return false;
  }
  return true;
}

function getBearerToken(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function authApiKey(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <apiKey>" });

  const prefix = token.slice(0, 12);
  const candidates = await prisma.apiKey.findMany({
    where: { keyPrefix: prefix, revokedAt: null },
    take: 5,
  });

  for (const k of candidates) {
    const ok = await bcrypt.compare(token, k.keyHash);
    if (ok) {
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
}
