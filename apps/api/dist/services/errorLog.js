"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSystemError = logSystemError;
const prisma_1 = require("../db/prisma");
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_STACK_LENGTH = 20_000;
/**
 * Log an error to SystemErrorLog. Never throws; failures are logged to console only.
 */
async function logSystemError(service, err, extra) {
    const message = extra?.message ?? (err instanceof Error ? err.message : String(err));
    const stack = err instanceof Error ? err.stack ?? null : null;
    const serviceTrim = String(service).slice(0, 64);
    const messageTrim = String(message).slice(0, MAX_MESSAGE_LENGTH);
    const stackTrim = stack ? String(stack).slice(0, MAX_STACK_LENGTH) : null;
    try {
        await prisma_1.prisma.systemErrorLog.create({
            data: {
                service: serviceTrim,
                message: messageTrim,
                stack: stackTrim,
            },
        });
    }
    catch (e) {
        console.error("[logSystemError] failed to write to DB", e);
    }
}
