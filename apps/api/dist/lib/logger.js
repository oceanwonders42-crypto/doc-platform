"use strict";
/**
 * Structured operational logging for API and worker.
 * Outputs JSON lines: { ts, level, message, requestId?, ...meta } for debugging production.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = log;
exports.logInfo = logInfo;
exports.logWarn = logWarn;
exports.logError = logError;
exports.requestLog = requestLog;
function formatLine(level, message, meta) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        message: String(message).slice(0, 2000),
    };
    if (meta && typeof meta === "object") {
        for (const [k, v] of Object.entries(meta)) {
            if (v === undefined)
                continue;
            payload[k] = v;
        }
    }
    return JSON.stringify(payload);
}
function log(level, message, meta) {
    const line = formatLine(level, message, meta);
    if (level === "error")
        console.error(line);
    else if (level === "warn")
        console.warn(line);
    else
        console.log(line);
}
function logInfo(message, meta) {
    log("info", message, meta);
}
function logWarn(message, meta) {
    log("warn", message, meta);
}
function logError(message, meta) {
    log("error", message, meta);
}
/** Log from API with requestId attached when available. */
function requestLog(req, level, message, meta) {
    const requestId = req.requestId;
    const fullMeta = requestId ? { requestId, ...meta } : meta;
    log(level, message, fullMeta ?? undefined);
}
