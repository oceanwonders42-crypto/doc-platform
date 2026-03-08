"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSafeError = sendSafeError;
exports.sendInternalError = sendInternalError;
exports.isValidId = isValidId;
exports.isValidEnum = isValidEnum;
const MAX_ERROR_LENGTH = 500;
const IS_DEV = process.env.NODE_ENV !== "production";
function sendSafeError(res, status, message, code, requestId) {
    const error = String(message).slice(0, MAX_ERROR_LENGTH);
    const body = { ok: false, error };
    if (code)
        body.code = code;
    if (requestId)
        body.requestId = requestId.slice(0, 64);
    res.status(status).json(body);
}
/** Use in catch blocks: log internally, respond with safe message. */
function sendInternalError(res, err, logFn, requestId) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    if (logFn)
        logFn(message, stack);
    const safeMessage = IS_DEV ? message : "An unexpected error occurred. Please try again.";
    sendSafeError(res, 500, safeMessage, "INTERNAL_ERROR", requestId);
}
/** Validate ID shape (cuid-like): alphanumeric, length ~25. Reject empty or obviously invalid. */
function isValidId(value) {
    if (typeof value !== "string" || !value.trim())
        return false;
    const trimmed = value.trim();
    if (trimmed.length > 36 || trimmed.length < 10)
        return false;
    return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}
/** Reject invalid enum value. */
function isValidEnum(value, allowed) {
    return typeof value === "string" && allowed.includes(value);
}
