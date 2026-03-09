/**
 * Unified auth middleware: Bearer API key, JWT (dashboard login), or PLATFORM_ADMIN_API_KEY.
 * Resolves firmId, userId, role (PLATFORM_ADMIN > FIRM_ADMIN > STAFF).
 */
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma";
import { Role } from "@prisma/client";
import { verifyToken, API_KEY_PREFIX } from "../../lib/jwt";

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

/**
 * Parse scopes string (e.g. "ingest" or "ingest,admin") into trimmed lowercase set.
 */
function parseScopes(scopes: string | null | undefined): Set<string> {
  if (!scopes || typeof scopes !== "string") return new Set();
  return new Set(scopes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Main auth: Bearer API key or PLATFORM_ADMIN_API_KEY.
 * (Session user: placeholder for future - check cookies/session after Bearer.)
 * Sets: req.firmId, req.apiKeyId?, req.userId?, req.authRole, req.authScopes, req.isAdmin?
 */
export async function auth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  // TODO: session user - if no Bearer, check req.session?.userId, resolve User+firmId+role
  const adminKey = process.env.PLATFORM_ADMIN_API_KEY;

  if (adminKey && token && token === adminKey) {
    (req as any).isAdmin = true;
    (req as any).authRole = Role.PLATFORM_ADMIN;
    (req as any).authScopes = new Set<string>();
    return next();
  }

  // Dashboard login: Bearer is a JWT (does not look like an API key)
  if (token && !token.startsWith(API_KEY_PREFIX)) {
    const payload = verifyToken(token);
    if (payload) {
      (req as any).firmId = payload.firmId;
      (req as any).userId = payload.userId;
      (req as any).authRole = payload.role as Role;
      (req as any).authScopes = new Set<string>();
      return next();
    }
  }

  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <apiKey>" });
  }

  const prefix = token.slice(0, 12);
  const candidates = await prisma.apiKey.findMany({
    where: { keyPrefix: prefix, revokedAt: null },
    take: 5,
    select: { id: true, firmId: true, userId: true, keyHash: true, scopes: true },
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
      (req as any).authScopes = parseScopes(k.scopes);

      if (k.userId) {
        const user = await prisma.user.findUnique({
          where: { id: k.userId },
          select: { role: true },
        });
        (req as any).userId = k.userId;
        (req as any).authRole = user?.role ?? Role.STAFF;
      } else {
        (req as any).userId = null;
        (req as any).authRole = Role.STAFF;
      }
      return next();
    }
  }

  return res.status(401).json({ ok: false, error: "Invalid API key" });
}
