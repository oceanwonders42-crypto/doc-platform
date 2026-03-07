import { prisma } from "../db/prisma";

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_STACK_LENGTH = 20_000;

export type SystemErrorLogSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";
export type SystemErrorLogStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export interface SystemErrorLogMeta {
  firmId?: string | null;
  userId?: string | null;
  area?: string | null;
  route?: string | null;
  method?: string | null;
  severity?: SystemErrorLogSeverity | null;
  metaJson?: Record<string, unknown> | null;
  status?: SystemErrorLogStatus | null;
  requestId?: string | null;
}

function writeLog(
  service: string,
  message: string,
  stack: string | null,
  meta?: SystemErrorLogMeta | null
): Promise<void> {
  const serviceTrim = String(service).slice(0, 64);
  const messageTrim = String(message).slice(0, MAX_MESSAGE_LENGTH);
  const stackTrim = stack ? String(stack).slice(0, MAX_STACK_LENGTH) : null;
  const data: Parameters<typeof prisma.systemErrorLog.create>[0]["data"] = {
    service: serviceTrim,
    message: messageTrim,
    stack: stackTrim,
  };
  if (meta) {
    if (meta.firmId != null) data.firmId = meta.firmId;
    if (meta.userId != null) data.userId = meta.userId;
    if (meta.area != null) data.area = String(meta.area).slice(0, 128);
    if (meta.route != null) data.route = String(meta.route).slice(0, 512);
    if (meta.method != null) data.method = String(meta.method).slice(0, 16);
    if (meta.severity != null) data.severity = meta.severity;
    const metaJsonObj = meta.metaJson != null ? { ...(meta.metaJson as Record<string, unknown>) } : {};
    if (meta.requestId != null) metaJsonObj.requestId = String(meta.requestId).slice(0, 64);
    if (Object.keys(metaJsonObj).length > 0) data.metaJson = metaJsonObj as object;
    if (meta.status != null) data.status = meta.status;
  }
  return prisma.systemErrorLog.create({ data }).then(() => {});
}

/**
 * Log an error to SystemErrorLog. Never throws; failures are logged to console only.
 * @param service - Service name (e.g. "api", "worker")
 * @param messageOrErr - Error message string, or an Error object
 * @param stack - Optional stack trace (ignored if messageOrErr is Error)
 * @param meta - Optional firmId, userId, area, route, method, severity, metaJson, status
 */
export async function logSystemError(
  service: string,
  messageOrErr: string | Error | unknown,
  stack?: string,
  meta?: SystemErrorLogMeta | null
): Promise<void> {
  let message: string;
  let stackVal: string | null;
  if (typeof messageOrErr === "string") {
    message = messageOrErr;
    stackVal = stack ?? null;
  } else if (messageOrErr instanceof Error) {
    message = messageOrErr.message;
    stackVal = messageOrErr.stack ?? stack ?? null;
  } else {
    message = String(messageOrErr);
    stackVal = stack ?? null;
  }
  try {
    await writeLog(service, message, stackVal, meta);
  } catch (e) {
    console.error("[logSystemError] failed to write to DB", e);
  }
}

export const FAILURE_CATEGORIES = [
  "OCR failure",
  "PDF parse failure",
  "upload failure",
  "CRM push failure",
  "mailbox auth failure",
  "records request send failure",
  "unknown",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

/**
 * Normalize SystemErrorLog.message into a failure category for aggregation.
 * Uses keyword matching (case-insensitive) on message and optional service.
 */
export function getFailureCategory(message: string, _service?: string): FailureCategory {
  const m = (message || "").toLowerCase();
  if (/\b(ocr|textract|text extraction)\b|textract|ocr failed|ocr error/i.test(m)) return "OCR failure";
  if (/\b(pdf|parse|pdfjs|invalid pdf|pdf parse|pdf extraction)\b/i.test(m)) return "PDF parse failure";
  if (/\b(upload|ingest|storage|s3|spaces|multipart|presign)\b|upload failed|ingest failed/i.test(m)) return "upload failure";
  if (/\b(crm|salesforce|clio|matter|push.*fail|push.*error)\b/i.test(m)) return "CRM push failure";
  if (/\b(mailbox|imap|smtp|auth.*fail|login.*fail|connection refused|econnrefused)\b|mailbox.*poll/i.test(m)) return "mailbox auth failure";
  if (/\b(records request|records request send|send failure|fax.*fail|email.*record)\b|recordsrequest/i.test(m)) return "records request send failure";
  return "unknown";
}
