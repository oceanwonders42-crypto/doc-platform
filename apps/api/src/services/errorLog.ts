import { prisma } from "../db/prisma";

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_STACK_LENGTH = 20_000;

function writeLog(service: string, message: string, stack: string | null): Promise<void> {
  const serviceTrim = String(service).slice(0, 64);
  const messageTrim = String(message).slice(0, MAX_MESSAGE_LENGTH);
  const stackTrim = stack ? String(stack).slice(0, MAX_STACK_LENGTH) : null;
  return prisma.systemErrorLog
    .create({
      data: { service: serviceTrim, message: messageTrim, stack: stackTrim },
    })
    .then(() => {});
}

/**
 * Log an error to SystemErrorLog. Never throws; failures are logged to console only.
 * @param service - Service name (e.g. "api", "worker")
 * @param messageOrErr - Error message string, or an Error object
 * @param stack - Optional stack trace (ignored if messageOrErr is Error)
 */
export async function logSystemError(
  service: string,
  messageOrErr: string | Error | unknown,
  stack?: string
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
    await writeLog(service, message, stackVal);
  } catch (e) {
    console.error("[logSystemError] failed to write to DB", e);
  }
}
