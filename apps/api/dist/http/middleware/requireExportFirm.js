"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireExportFirm = requireExportFirm;
/**
 * Resolves firmId for export routes. Requires auth first.
 * - PLATFORM_ADMIN: firmId from query param (required)
 * - API key: firmId from key (query param must match if provided)
 */
function requireExportFirm(req, res, next) {
    const queryFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : null;
    const isAdmin = req.isAdmin === true;
    if (isAdmin) {
        if (!queryFirmId) {
            return res.status(400).json({ ok: false, error: "firmId query param required" });
        }
        req.firmId = queryFirmId;
        return next();
    }
    const keyFirmId = req.firmId;
    if (queryFirmId && queryFirmId !== keyFirmId) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    next();
}
