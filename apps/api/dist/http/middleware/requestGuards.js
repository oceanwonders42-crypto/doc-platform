"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maxBodySize = maxBodySize;
exports.validateIdParam = validateIdParam;
exports.normalizeEmptyString = normalizeEmptyString;
const errors_1 = require("../../lib/errors");
const MAX_CONTENT_LENGTH = 25 * 1024 * 1024; // 25MB, should match express.json limit
/** Reject request if Content-Length exceeds limit. */
function maxBodySize(maxBytes = MAX_CONTENT_LENGTH) {
    return function (req, res, next) {
        const len = req.get("content-length");
        if (len) {
            const n = parseInt(len, 10);
            if (Number.isFinite(n) && n > maxBytes) {
                (0, errors_1.sendSafeError)(res, 413, "Request entity too large", "PAYLOAD_TOO_LARGE");
                return;
            }
        }
        next();
    };
}
/** Validate :id param is a valid cuid-like string. Call after route matched. */
function validateIdParam(paramName = "id") {
    return function (req, res, next) {
        const id = req.params[paramName];
        if (id == null || typeof id !== "string" || !id.trim()) {
            (0, errors_1.sendSafeError)(res, 400, "Invalid or missing ID", "VALIDATION_ERROR");
            return;
        }
        const trimmed = id.trim();
        if (trimmed.length > 36 || trimmed.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
            (0, errors_1.sendSafeError)(res, 400, "Invalid ID format", "VALIDATION_ERROR");
            return;
        }
        next();
    };
}
/** Normalize empty string to null for body fields (optional use in routes). */
function normalizeEmptyString(value) {
    if (typeof value === "string" && value.trim() === "")
        return null;
    return value;
}
