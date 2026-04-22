/**
 * File security: validation + scanner abstraction. Future-proof for antivirus integration.
 */
import type { FileScanResult } from "./types";
import { toLegacyResult } from "./types";
import { validateFileType, validateSize, MAX_UPLOAD_BYTES } from "./basicFileValidation";
import { scanBuffer as stubScanBuffer } from "./scannerStub";

export type { FileScanResult, ScanSeverity } from "./types";
export { validateFileType, validateSize, MAX_UPLOAD_BYTES } from "./basicFileValidation";
export { scanBuffer as scanBufferStub } from "./scannerStub";

/**
 * Validate upload: extension, MIME, size, non-empty buffer. Optionally run stub scanner.
 * Returns structured result (accepted, reason, severity, scannerUsed).
 * Legacy: also compatible with { ok, reason?, quarantine? } for existing server code.
 */
export async function validateUploadFile(opts: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): Promise<FileScanResult> {
  const sizeResult = validateSize(opts.size);
  if (!sizeResult.accepted) return sizeResult;
  if (!opts.buffer || !Buffer.isBuffer(opts.buffer)) {
    return { accepted: false, ok: false, reason: "File data missing or invalid", severity: "high", scannerUsed: "basic" };
  }
  if (opts.buffer.length === 0) {
    return { accepted: false, ok: false, reason: "File is empty", severity: "medium", scannerUsed: "basic" };
  }
  if (opts.size > 0 && opts.buffer.length !== opts.size) {
    return { accepted: false, ok: false, reason: "File size mismatch (corrupt or truncated)", severity: "high", scannerUsed: "basic" };
  }
  const typeResult = validateFileType(opts.originalname, opts.mimetype);
  if (!typeResult.accepted) return typeResult;
  const scanResult = await stubScanBuffer(opts.buffer, opts.originalname, opts.mimetype);
  return scanResult;
}

/**
 * Synchronous validation only (no async scanner). Use when you need a sync API.
 * Return type includes ok/reason for backward compatibility.
 */
export function validateUploadFileSync(opts: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): FileScanResult {
  const sizeResult = validateSize(opts.size);
  if (!sizeResult.accepted) return sizeResult;
  if (!opts.buffer || !Buffer.isBuffer(opts.buffer) || opts.buffer.length === 0) {
    return { accepted: false, ok: false, reason: "File is empty or invalid", severity: "medium", scannerUsed: "basic" };
  }
  if (opts.size > 0 && opts.buffer.length !== opts.size) {
    return { accepted: false, ok: false, reason: "File size mismatch (corrupt or truncated)", severity: "high", scannerUsed: "basic" };
  }
  return validateFileType(opts.originalname, opts.mimetype);
}

/** For callers that expect legacy { ok, reason?, quarantine? } from validateUploadFile. */
export function validateUploadFileLegacy(opts: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): { ok: true } | { ok: false; reason: string; quarantine?: boolean } {
  const r = validateUploadFileSync(opts);
  return toLegacyResult(r);
}
