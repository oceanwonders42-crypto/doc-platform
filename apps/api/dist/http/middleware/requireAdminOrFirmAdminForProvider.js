"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminOrFirmAdminForProvider = requireAdminOrFirmAdminForProvider;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../db/prisma");
const requireRole_1 = require("./requireRole");
/**
 * For routes like POST /providers/:id/invites.
 * Requires auth first. Allows either:
 * - PLATFORM_ADMIN
 * - API key with firmId matching the provider's firm, and FIRM_ADMIN role
 */
async function requireAdminOrFirmAdminForProvider(req, res, next) {
    if (req.isAdmin === true)
        return next();
    const providerId = String(req.params.id ?? "");
    const provider = await prisma_1.prisma.provider.findUnique({
        where: { id: providerId },
        select: { firmId: true },
    });
    if (!provider) {
        return res.status(404).json({ ok: false, error: "Provider not found" });
    }
    const firmId = req.firmId;
    if (firmId !== provider.firmId) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN)(req, res, next);
}
