"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_UPLOAD_BYTES = void 0;
exports.validateFileType = validateFileType;
exports.validateSize = validateSize;
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
exports.MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
function validateFileType(originalName, mimeType) {
    const name = (originalName || "").trim();
    if (!name)
        return { accepted: false, ok: false, reason: "Missing filename", severity: "medium", scannerUsed: "basic" };
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
function validateSize(sizeBytes) {
    if (sizeBytes > exports.MAX_UPLOAD_BYTES) {
        return { accepted: false, ok: false, reason: "File too large", severity: "medium", scannerUsed: "basic" };
    }
    return { accepted: true, ok: true, scannerUsed: "basic" };
}
