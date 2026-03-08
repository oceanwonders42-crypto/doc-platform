"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authAdmin = authAdmin;
function getBearerToken(req) {
    const h = req.header("authorization") || req.header("Authorization");
    if (!h)
        return null;
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}
/**
 * Requires PLATFORM_ADMIN_API_KEY in env. Accepts only requests with
 * Authorization: Bearer <PLATFORM_ADMIN_API_KEY>. Use for /admin/* routes.
 */
async function authAdmin(req, res, next) {
    const key = process.env.PLATFORM_ADMIN_API_KEY;
    if (!key || !key.trim()) {
        return res.status(503).json({ ok: false, error: "Admin API not configured" });
    }
    const token = getBearerToken(req);
    if (!token || token !== key) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    req.isAdmin = true;
    next();
}
