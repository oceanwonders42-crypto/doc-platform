"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendError = sendError;
const MAX_ERROR_LENGTH = 500;
function sendError(res, status, message) {
    const error = String(message).slice(0, MAX_ERROR_LENGTH);
    res.status(status).json({ ok: false, error });
}
