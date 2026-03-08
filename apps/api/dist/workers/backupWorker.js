"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBackup = runBackup;
/**
 * Backup worker: run on schedule (daily default), trigger DB backup, record metadata, verify, apply retention.
 * On failure creates SystemErrorLog.
 * Run: pnpm backup:run or schedule via cron: 0 2 * * * cd apps/api && pnpm backup:run
 */
require("dotenv/config");
const backupManager_1 = require("../services/backupManager");
const errorLog_1 = require("../services/errorLog");
const systemAlerts_1 = require("../services/systemAlerts");
const SERVICE = "backup-worker";
async function runBackup() {
    const result = await (0, backupManager_1.triggerDatabaseBackup)();
    if (result.status === "FAILED") {
        await (0, systemAlerts_1.emitSystemAlert)("backup_failed", {
            backupId: result.id,
            location: result.location,
            message: "Backup completed with FAILED status (e.g. checksum verification failed)",
        });
        throw new Error(`Backup failed: ${result.id}`);
    }
    const retention = await (0, backupManager_1.applyRetention)();
    if (retention.errors.length > 0) {
        retention.errors.forEach((err) => console.warn("[backup-worker]", err));
    }
}
async function main() {
    console.log("[backup-worker] Starting scheduled backup...");
    try {
        await runBackup();
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;
        await (0, errorLog_1.logSystemError)(SERVICE, `Backup failed: ${message}`, stack, { severity: "CRITICAL" });
        await (0, systemAlerts_1.emitSystemAlert)("backup_failed", { message, stack: stack?.slice(0, 500) });
        console.error("[backup-worker] Fatal error:", message);
        process.exitCode = 1;
        return;
    }
    console.log("[backup-worker] Done.");
}
main();
