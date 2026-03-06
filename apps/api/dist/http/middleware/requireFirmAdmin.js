"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFirmAdmin = requireFirmAdmin;
const prisma_1 = require("../../db/prisma");
const client_1 = require("@prisma/client");
/**
 * Requires authApiKey first. Checks that the API key's user has FIRM_ADMIN or
 * PLATFORM_ADMIN role. If the key has no userId (service key), allows access
 * for backward compatibility.
 */
async function requireFirmAdmin(req, res, next) {
    const apiKeyId = req.apiKeyId;
    if (!apiKeyId) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const apiKey = await prisma_1.prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        select: { userId: true },
    });
    if (!apiKey)
        return res.status(401).json({ ok: false, error: "API key not found" });
    // Service keys (no user) are allowed for backward compatibility
    if (!apiKey.userId)
        return next();
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: apiKey.userId },
        select: { role: true },
    });
    if (!user)
        return next();
    if (user.role === client_1.Role.FIRM_ADMIN || user.role === client_1.Role.PLATFORM_ADMIN) {
        return next();
    }
    return res.status(403).json({ ok: false, error: "Firm admin role required" });
}
