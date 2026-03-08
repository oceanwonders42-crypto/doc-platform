"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSystemAlert = emitSystemAlert;
exports.triggerBackupNotRunAlert = triggerBackupNotRunAlert;
/**
 * System alerts: backup failure, missed backup window, restore attempted.
 * Emits are logged to SystemErrorLog and can be extended (e.g. Slack, PagerDuty).
 */
const errorLog_1 = require("./errorLog");
const SERVICE = "system-alerts";
/**
 * Emit a system alert. Logs to SystemErrorLog with severity; can be extended to notify external systems.
 */
async function emitSystemAlert(type, payload) {
    const message = type === "backup_failed"
        ? `Backup failed: ${payload.message ?? payload.backupId ?? "unknown"}`
        : type === "backup_not_run"
            ? `Backup not run in expected window: ${payload.message ?? "no backup in last 26h"}`
            : `Restore operation attempted: ${payload.backupId ?? payload.message ?? "unknown"}`;
    await (0, errorLog_1.logSystemError)(SERVICE, message, payload.stack, {
        severity: type === "restore_attempted" ? "WARN" : "CRITICAL",
        metaJson: { type, ...payload },
    });
}
/** Trigger alert when backup has not run in expected window (e.g. 26h). */
async function triggerBackupNotRunAlert(hoursSinceLastBackup) {
    await emitSystemAlert("backup_not_run", {
        message: `No backup in the last ${hoursSinceLastBackup} hours`,
    });
}
