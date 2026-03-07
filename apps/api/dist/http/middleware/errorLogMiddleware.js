"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogMiddleware = errorLogMiddleware;
const errorLog_1 = require("../../services/errorLog");
const errors_1 = require("../../lib/errors");
const SERVICE = "api";
/**
 * Express error-handling middleware. Logs uncaught API errors to SystemErrorLog
 * and responds with safe structured error (no stack to client). Includes requestId in response.
 */
function errorLogMiddleware(err, req, res, _next) {
    const r = req;
    const requestId = r.requestId ?? null;
    const meta = {
        firmId: r.firmId ?? null,
        userId: r.userId ?? null,
        requestId,
        area: "api",
        route: req.path ?? null,
        method: req.method ?? null,
        severity: "ERROR",
        status: "OPEN",
    };
    (0, errorLog_1.logSystemError)(SERVICE, err, undefined, meta).catch(() => { });
    const message = err instanceof Error ? err.message : String(err);
    (0, errors_1.sendSafeError)(res, 500, message, "INTERNAL_ERROR", requestId);
}
