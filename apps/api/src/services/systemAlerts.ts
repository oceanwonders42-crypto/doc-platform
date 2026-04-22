/**
 * System alerts: backup failure, missed backup window, restore attempted.
 * Emits are logged to SystemErrorLog and can be extended (e.g. Slack, PagerDuty).
 */
import { logSystemError } from "./errorLog";

const SERVICE = "system-alerts";

export type AlertType = "backup_failed" | "backup_not_run" | "restore_attempted";

export interface AlertPayload {
  backupId?: string;
  location?: string;
  message?: string;
  stack?: string;
  [key: string]: unknown;
}

/**
 * Emit a system alert. Logs to SystemErrorLog with severity; can be extended to notify external systems.
 */
export async function emitSystemAlert(
  type: AlertType,
  payload: AlertPayload
): Promise<void> {
  const message =
    type === "backup_failed"
      ? `Backup failed: ${payload.message ?? payload.backupId ?? "unknown"}`
      : type === "backup_not_run"
        ? `Backup not run in expected window: ${payload.message ?? "no backup in last 26h"}`
        : `Restore operation attempted: ${payload.backupId ?? payload.message ?? "unknown"}`;

  await logSystemError(SERVICE, message, payload.stack as string | undefined, {
    severity: type === "restore_attempted" ? "WARN" : "CRITICAL",
    metaJson: { type, ...payload },
  });
}

/** Trigger alert when backup has not run in expected window (e.g. 26h). */
export async function triggerBackupNotRunAlert(hoursSinceLastBackup: number): Promise<void> {
  await emitSystemAlert("backup_not_run", {
    message: `No backup in the last ${hoursSinceLastBackup} hours`,
  });
}
