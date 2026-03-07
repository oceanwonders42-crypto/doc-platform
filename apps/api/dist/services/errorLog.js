"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAILURE_CATEGORIES = void 0;
exports.logSystemError = logSystemError;
exports.getFailureCategory = getFailureCategory;
const prisma_1 = require("../db/prisma");
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_STACK_LENGTH = 20_000;
function writeLog(service, message, stack, meta) {
    const serviceTrim = String(service).slice(0, 64);
    const messageTrim = String(message).slice(0, MAX_MESSAGE_LENGTH);
    const stackTrim = stack ? String(stack).slice(0, MAX_STACK_LENGTH) : null;
    const data = {
        service: serviceTrim,
        message: messageTrim,
        stack: stackTrim,
    };
    if (meta) {
        if (meta.firmId != null)
            data.firmId = meta.firmId;
        if (meta.userId != null)
            data.userId = meta.userId;
        if (meta.area != null)
            data.area = String(meta.area).slice(0, 128);
        if (meta.route != null)
            data.route = String(meta.route).slice(0, 512);
        if (meta.method != null)
            data.method = String(meta.method).slice(0, 16);
        if (meta.severity != null)
            data.severity = meta.severity;
        const metaJsonObj = meta.metaJson != null ? { ...meta.metaJson } : {};
        if (meta.requestId != null)
            metaJsonObj.requestId = String(meta.requestId).slice(0, 64);
        if (Object.keys(metaJsonObj).length > 0)
            data.metaJson = metaJsonObj;
        if (meta.status != null)
            data.status = meta.status;
    }
    return prisma_1.prisma.systemErrorLog.create({ data }).then(() => { });
}
/**
 * Log an error to SystemErrorLog. Never throws; failures are logged to console only.
 * @param service - Service name (e.g. "api", "worker")
 * @param messageOrErr - Error message string, or an Error object
 * @param stack - Optional stack trace (ignored if messageOrErr is Error)
 * @param meta - Optional firmId, userId, area, route, method, severity, metaJson, status
 */
async function logSystemError(service, messageOrErr, stack, meta) {
    let message;
    let stackVal;
    if (typeof messageOrErr === "string") {
        message = messageOrErr;
        stackVal = stack ?? null;
    }
    else if (messageOrErr instanceof Error) {
        message = messageOrErr.message;
        stackVal = messageOrErr.stack ?? stack ?? null;
    }
    else {
        message = String(messageOrErr);
        stackVal = stack ?? null;
    }
    try {
        await writeLog(service, message, stackVal, meta);
    }
    catch (e) {
        console.error("[logSystemError] failed to write to DB", e);
    }
}
exports.FAILURE_CATEGORIES = [
    "OCR failure",
    "PDF parse failure",
    "upload failure",
    "CRM push failure",
    "mailbox auth failure",
    "records request send failure",
    "unknown",
];
/**
 * Normalize SystemErrorLog.message into a failure category for aggregation.
 * Uses keyword matching (case-insensitive) on message and optional service.
 */
function getFailureCategory(message, _service) {
    const m = (message || "").toLowerCase();
    if (/\b(ocr|textract|text extraction)\b|textract|ocr failed|ocr error/i.test(m))
        return "OCR failure";
    if (/\b(pdf|parse|pdfjs|invalid pdf|pdf parse|pdf extraction)\b/i.test(m))
        return "PDF parse failure";
    if (/\b(upload|ingest|storage|s3|spaces|multipart|presign)\b|upload failed|ingest failed/i.test(m))
        return "upload failure";
    if (/\b(crm|salesforce|clio|matter|push.*fail|push.*error)\b/i.test(m))
        return "CRM push failure";
    if (/\b(mailbox|imap|smtp|auth.*fail|login.*fail|connection refused|econnrefused)\b|mailbox.*poll/i.test(m))
        return "mailbox auth failure";
    if (/\b(records request|records request send|send failure|fax.*fail|email.*record)\b|recordsrequest/i.test(m))
        return "records request send failure";
    return "unknown";
}
