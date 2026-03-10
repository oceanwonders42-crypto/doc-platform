"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanBufferStub = exports.MAX_UPLOAD_BYTES = exports.validateSize = exports.validateFileType = void 0;
exports.validateUploadFile = validateUploadFile;
exports.validateUploadFileSync = validateUploadFileSync;
exports.validateUploadFileLegacy = validateUploadFileLegacy;
const types_1 = require("./types");
const basicFileValidation_1 = require("./basicFileValidation");
const scannerStub_1 = require("./scannerStub");
var basicFileValidation_2 = require("./basicFileValidation");
Object.defineProperty(exports, "validateFileType", { enumerable: true, get: function () { return basicFileValidation_2.validateFileType; } });
Object.defineProperty(exports, "validateSize", { enumerable: true, get: function () { return basicFileValidation_2.validateSize; } });
Object.defineProperty(exports, "MAX_UPLOAD_BYTES", { enumerable: true, get: function () { return basicFileValidation_2.MAX_UPLOAD_BYTES; } });
var scannerStub_2 = require("./scannerStub");
Object.defineProperty(exports, "scanBufferStub", { enumerable: true, get: function () { return scannerStub_2.scanBuffer; } });
/**
 * Validate upload: extension, MIME, size, non-empty buffer. Optionally run stub scanner.
 * Returns structured result (accepted, reason, severity, scannerUsed).
 * Legacy: also compatible with { ok, reason?, quarantine? } for existing server code.
 */
async function validateUploadFile(opts) {
    const sizeResult = (0, basicFileValidation_1.validateSize)(opts.size);
    if (!sizeResult.accepted)
        return sizeResult;
    if (!opts.buffer || !Buffer.isBuffer(opts.buffer)) {
        return { accepted: false, ok: false, reason: "File data missing or invalid", severity: "high", scannerUsed: "basic" };
    }
    if (opts.buffer.length === 0) {
        return { accepted: false, ok: false, reason: "File is empty", severity: "medium", scannerUsed: "basic" };
    }
    if (opts.size > 0 && opts.buffer.length !== opts.size) {
        return { accepted: false, ok: false, reason: "File size mismatch (corrupt or truncated)", severity: "high", scannerUsed: "basic" };
    }
    const typeResult = (0, basicFileValidation_1.validateFileType)(opts.originalname, opts.mimetype);
    if (!typeResult.accepted)
        return typeResult;
    const scanResult = await (0, scannerStub_1.scanBuffer)(opts.buffer, opts.originalname, opts.mimetype);
    return scanResult;
}
/**
 * Synchronous validation only (no async scanner). Use when you need a sync API.
 * Return type includes ok/reason for backward compatibility.
 */
function validateUploadFileSync(opts) {
    const sizeResult = (0, basicFileValidation_1.validateSize)(opts.size);
    if (!sizeResult.accepted)
        return sizeResult;
    if (!opts.buffer || !Buffer.isBuffer(opts.buffer) || opts.buffer.length === 0) {
        return { accepted: false, ok: false, reason: "File is empty or invalid", severity: "medium", scannerUsed: "basic" };
    }
    if (opts.size > 0 && opts.buffer.length !== opts.size) {
        return { accepted: false, ok: false, reason: "File size mismatch (corrupt or truncated)", severity: "high", scannerUsed: "basic" };
    }
    return (0, basicFileValidation_1.validateFileType)(opts.originalname, opts.mimetype);
}
/** For callers that expect legacy { ok, reason?, quarantine? } from validateUploadFile. */
function validateUploadFileLegacy(opts) {
    const r = validateUploadFileSync(opts);
    return (0, types_1.toLegacyResult)(r);
}
