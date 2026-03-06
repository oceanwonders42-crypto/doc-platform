"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authApiKey = authApiKey;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../db/prisma");
function getBearerToken(req) {
    const h = req.header("authorization") || req.header("Authorization");
    if (!h)
        return null;
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}
async function authApiKey(req, res, next) {
    const token = getBearerToken(req);
    if (!token)
        return res.status(401).json({ error: "Missing Authorization: Bearer <apiKey>" });
    const prefix = token.slice(0, 12);
    const candidates = await prisma_1.prisma.apiKey.findMany({
        where: { keyPrefix: prefix, revokedAt: null },
        take: 5,
    });
    for (const k of candidates) {
        const ok = await bcryptjs_1.default.compare(token, k.keyHash);
        if (ok) {
            await prisma_1.prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
            req.firmId = k.firmId;
            req.apiKeyId = k.id;
            return next();
        }
    }
    return res.status(401).json({ error: "Invalid API key" });
}
