"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFilename = normalizeFilename;
exports.buildOriginalMetadata = buildOriginalMetadata;
/**
 * Document ingestion helpers: filename normalization and original metadata.
 * Used by POST /ingest and case document upload.
 */
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const MAX_FILENAME_LENGTH = 200;
/**
 * Normalize filename for storage and display: strip path, replace unsafe chars, trim length.
 * Keeps extension; does not change case.
 */
function normalizeFilename(originalName) {
    if (!originalName || typeof originalName !== "string")
        return "document";
    const basename = originalName.replace(/^.*[/\\]/, "").trim();
    const normalized = basename.replace(UNSAFE_FILENAME_CHARS, "_").replace(/\s+/g, " ").trim();
    if (!normalized)
        return "document";
    if (normalized.length > MAX_FILENAME_LENGTH) {
        const ext = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".")) : "";
        const base = normalized.slice(0, MAX_FILENAME_LENGTH - ext.length);
        return base + ext;
    }
    return normalized;
}
/**
 * Build original metadata object for Document.metaJson (audit and re-processing).
 */
function buildOriginalMetadata(opts) {
    return {
        originalFilename: opts.originalFilename || "",
        normalizedFilename: normalizeFilename(opts.originalFilename),
        sizeBytes: Number(opts.sizeBytes) || 0,
        mimeType: opts.mimeType || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
    };
}
