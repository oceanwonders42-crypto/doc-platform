"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingFirmIdError = void 0;
exports.requireFirmId = requireFirmId;
exports.assertSameFirm = assertSameFirm;
exports.firmScopedWhere = firmScopedWhere;
exports.getAuthContext = getAuthContext;
exports.requireFirmIdFromRequest = requireFirmIdFromRequest;
exports.assertRecordBelongsToFirm = assertRecordBelongsToFirm;
exports.buildFirmWhere = buildFirmWhere;
exports.getFirmIdForAdminOrFirm = getFirmIdForAdminOrFirm;
exports.forbidCrossTenantAccess = forbidCrossTenantAccess;
exports.sendNotFound = sendNotFound;
exports.sendForbidden = sendForbidden;
const client_1 = require("@prisma/client");
const FIRM_ID_ERR = "Forbidden";
const NOT_FOUND_ERR = "Not found";
/** Thrown when firmId is missing from request (use in middleware or catch for 401). */
class MissingFirmIdError extends Error {
    constructor() {
        super("Missing firmId");
        this.name = "MissingFirmIdError";
    }
}
exports.MissingFirmIdError = MissingFirmIdError;
/**
 * Require firmId from request (set by auth middleware).
 * Returns firmId or throws MissingFirmIdError.
 * Use with try/catch or after auth to send 401/403.
 */
function requireFirmId(req) {
    const firmId = req.firmId;
    if (!firmId || typeof firmId !== "string" || !firmId.trim()) {
        throw new MissingFirmIdError();
    }
    return firmId.trim();
}
/**
 * Assert that a record's firmId matches the current firm.
 * Throws if mismatch (caller can send 404 to avoid leaking existence).
 * Returns true if same firm.
 */
function assertSameFirm(recordFirmId, firmId) {
    if (recordFirmId == null || recordFirmId !== firmId) {
        throw new Error(NOT_FOUND_ERR);
    }
    return true;
}
/**
 * Build a where clause that always includes firmId (firm-scoped query).
 * Alias for buildFirmWhere for the name requested in task.
 */
function firmScopedWhere(firmId, where = {}) {
    return { ...where, firmId };
}
/**
 * Get auth context from request (set by auth middleware).
 * firmId is null when using PLATFORM_ADMIN_API_KEY.
 */
function getAuthContext(req) {
    const r = req;
    return {
        firmId: r.firmId ?? null,
        authRole: r.authRole ?? client_1.Role.STAFF,
        isPlatformAdmin: r.isAdmin === true || r.authRole === client_1.Role.PLATFORM_ADMIN,
    };
}
/**
 * Require firmId from authenticated context. Use on firm-scoped routes only.
 * Returns firmId or sends 403 and returns undefined.
 */
function requireFirmIdFromRequest(req, res) {
    const ctx = getAuthContext(req);
    if (ctx.firmId)
        return ctx.firmId;
    res.status(403).json({ ok: false, error: FIRM_ID_ERR });
    return undefined;
}
/**
 * Assert that a record's firmId matches the current context.
 * Call after fetching a record by id; use for update/delete/get-one.
 * Sends 404 (do not leak existence of other tenant's data) and returns false on mismatch.
 */
function assertRecordBelongsToFirm(recordFirmId, currentFirmId, res) {
    if (recordFirmId == null || recordFirmId !== currentFirmId) {
        res.status(404).json({ ok: false, error: NOT_FOUND_ERR });
        return false;
    }
    return true;
}
/**
 * Build a Prisma where clause that always includes firmId.
 * Use for findMany, findFirst, count, etc. on tenant-scoped models.
 */
function buildFirmWhere(firmId, extraWhere) {
    return firmScopedWhere(firmId, extraWhere ?? {});
}
/**
 * For platform-admin-only routes: allow optional firmId from query for filtering.
 * For firm users: ignore query firmId and use auth firmId only.
 * Returns the firmId to use for the query.
 */
function getFirmIdForAdminOrFirm(req, res) {
    const ctx = getAuthContext(req);
    if (ctx.isPlatformAdmin) {
        const fromQuery = typeof req.query.firmId === "string" && req.query.firmId.trim()
            ? req.query.firmId.trim()
            : null;
        const fromBody = typeof req.body?.firmId === "string" && req.body.firmId?.trim()
            ? req.body.firmId.trim()
            : null;
        const chosen = fromQuery ?? fromBody ?? ctx.firmId;
        if (chosen)
            return chosen;
        // Admin listing all: no firmId filter
        return undefined;
    }
    if (ctx.firmId)
        return ctx.firmId;
    res.status(403).json({ ok: false, error: FIRM_ID_ERR });
    return undefined;
}
/**
 * Reject request if body or query contains firmId and the user is not a platform admin.
 * Call early in firm-scoped routes to prevent clients from sending a different firmId.
 */
function forbidCrossTenantAccess(req, res) {
    const ctx = getAuthContext(req);
    if (ctx.isPlatformAdmin)
        return true;
    const bodyFirmId = req.body?.firmId;
    const queryFirmId = req.query.firmId;
    if (bodyFirmId != null && String(bodyFirmId).trim() !== "" && String(bodyFirmId) !== ctx.firmId) {
        res.status(403).json({ ok: false, error: FIRM_ID_ERR });
        return false;
    }
    if (queryFirmId != null && String(queryFirmId).trim() !== "" && String(queryFirmId) !== ctx.firmId) {
        res.status(403).json({ ok: false, error: FIRM_ID_ERR });
        return false;
    }
    return true;
}
/**
 * Safe 403/404: do not leak whether another tenant's resource exists.
 * Prefer 404 for "resource not found or not allowed".
 */
function sendNotFound(res, message = NOT_FOUND_ERR) {
    res.status(404).json({ ok: false, error: message });
}
function sendForbidden(res, message = FIRM_ID_ERR) {
    res.status(403).json({ ok: false, error: message });
}
