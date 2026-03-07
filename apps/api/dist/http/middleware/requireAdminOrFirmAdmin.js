"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminOrFirmAdminForFirm = requireAdminOrFirmAdminForFirm;
const client_1 = require("@prisma/client");
const requireRole_1 = require("./requireRole");
/**
 * For routes like POST /firms/:id/users and POST /firms/:id/api-keys.
 * Requires auth first. Allows either:
 * - PLATFORM_ADMIN (isAdmin)
 * - API key with firmId matching params.id and FIRM_ADMIN/PLATFORM_ADMIN role
 */
function requireAdminOrFirmAdminForFirm(req, res, next) {
    if (req.isAdmin === true)
        return next();
    const firmId = req.firmId;
    const paramId = String(req.params.id ?? req.params.firmId ?? "");
    if (firmId !== paramId) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN)(req, res, next);
}
