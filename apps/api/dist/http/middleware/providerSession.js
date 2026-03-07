"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProviderSession = createProviderSession;
exports.clearProviderSession = clearProviderSession;
exports.requireProviderSession = requireProviderSession;
/**
 * Provider session auth using signed cookie.
 * Cookie: provider_session = base64url(accountId).base64url(signature)
 */
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../../db/prisma");
const COOKIE_NAME = "provider_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
function getSecret() {
    const s = process.env.PROVIDER_SESSION_SECRET || process.env.SESSION_SECRET || "dev-secret-change-in-prod";
    return s;
}
function sign(value) {
    return crypto_1.default.createHmac("sha256", getSecret()).update(value).digest("base64url");
}
function createProviderSession(res, providerAccountId) {
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
function clearProviderSession(res) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
}
function getSessionFromCookie(req) {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw || typeof raw !== "string")
        return null;
    const [accountId, sig] = raw.split(".");
    if (!accountId || !sig)
        return null;
    if (sign(accountId) !== sig)
        return null;
    return accountId;
}
/**
 * Require provider session. Sets req.providerAccount and req.providerId.
 */
async function requireProviderSession(req, res, next) {
    const accountId = getSessionFromCookie(req);
    if (!accountId) {
        return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const account = await prisma_1.prisma.providerAccount.findUnique({
        where: { id: accountId },
        include: { provider: true },
    });
    if (!account) {
        return res.status(401).json({ ok: false, error: "Session invalid" });
    }
    req.providerAccount = account;
    req.providerId = account.providerId;
    next();
}
