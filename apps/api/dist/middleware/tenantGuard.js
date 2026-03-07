"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantGuard = tenantGuard;
function tenantGuard(req, res, next) {
    const firmId = req.firmId;
    if (!firmId || typeof firmId !== "string" || !firmId.trim()) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
    }
    req.tenant = { firmId: firmId.trim() };
    next();
}
