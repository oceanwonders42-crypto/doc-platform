"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendError = sendError;
const MAX_ERROR_LENGTH = 500;
function sendError(res, status, message, code, requestId) {
    const error = String(message).slice(0, MAX_ERROR_LENGTH);
    const body = { ok: false, error };
    if (code)
        body.code = code;
    if (requestId)
        body.requestId = requestId.slice(0, 64);
    res.status(status).json(body);
}
