"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogMiddleware = errorLogMiddleware;
const errorLog_1 = require("../../services/errorLog");
const sendError_1 = require("./sendError");
const SERVICE = "api";
/**
 * Express error-handling middleware. Logs uncaught API errors to SystemErrorLog
 * and responds with 500. Attach after all routes; use next(err) in route handlers
 * to send errors here.
 */
function errorLogMiddleware(err, _req, res, _next) {
    (0, errorLog_1.logSystemError)(SERVICE, err).catch(() => { });
    const message = err instanceof Error ? err.message : String(err);
    (0, sendError_1.sendError)(res, 500, message);
}
