/**
 * Basic file validation: extension, MIME, size. No content scan.
 */
import type { FileScanResult } from "./types";

const DANGEROUS_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "pif", "vbs", "js", "jse", "ws", "wsf", "ps1", "psm1",
  "sh", "bash", "csh", "php", "php3", "php4", "phtml", "pl", "py", "rb", "jar", "dll", "so", "dylib",
]);
const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "image/",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.",
];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

export function validateFileType(originalName: string, mimeType: string | null): FileScanResult {
  const name = (originalName || "").trim();
  if (!name) return { accepted: false, ok: false, reason: "Missing filename", severity: "medium", scannerUsed: "basic" };
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
    return { accepted: false, ok: false, reason: "File type not allowed", severity: "critical", scannerUsed: "basic", quarantine: true };
  }
  const mime = (mimeType || "").trim().toLowerCase();
  if (mime) {
    const allowed = ALLOWED_MIME_PREFIXES.some((p) => mime === p || mime.startsWith(p));
    if (!allowed) {
      return { accepted: false, ok: false, reason: "MIME type not allowed", severity: "high", scannerUsed: "basic" };
    }
  }
  return { accepted: true, ok: true, scannerUsed: "basic" };
}

export function validateSize(sizeBytes: number): FileScanResult {
  if (sizeBytes <= 0 || !Number.isFinite(sizeBytes)) {
    return { accepted: false, ok: false, reason: "File is empty or invalid size", severity: "medium", scannerUsed: "basic" };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return { accepted: false, ok: false, reason: "File too large", severity: "medium", scannerUsed: "basic" };
  }
  return { accepted: true, ok: true, scannerUsed: "basic" };
}
