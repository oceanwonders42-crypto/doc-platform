/**
 * Provider session auth using signed cookie.
 * Cookie: provider_session = base64url(accountId).base64url(signature)
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/prisma";

const COOKIE_NAME = "provider_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const s = process.env.PROVIDER_SESSION_SECRET || process.env.SESSION_SECRET || "dev-secret-change-in-prod";
  return s;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createProviderSession(res: Response, providerAccountId: string) {
  const sig = sign(providerAccountId);
  const value = `${providerAccountId}.${sig}`;
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearProviderSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

function getSessionFromCookie(req: Request): string | null {
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw || typeof raw !== "string") return null;
  const [accountId, sig] = raw.split(".");
  if (!accountId || !sig) return null;
  if (sign(accountId) !== sig) return null;
  return accountId;
}

/**
 * Require provider session. Sets req.providerAccount and req.providerId.
 */
export async function requireProviderSession(req: Request, res: Response, next: NextFunction) {
  const accountId = getSessionFromCookie(req);
  if (!accountId) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }

  const account = await prisma.providerAccount.findUnique({
    where: { id: accountId },
    include: { provider: true },
  });
  if (!account) {
    return res.status(401).json({ ok: false, error: "Session invalid" });
  }

  (req as any).providerAccount = account;
  (req as any).providerId = account.providerId;
  next();
}
