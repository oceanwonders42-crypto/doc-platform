#!/usr/bin/env node
/**
 * Run backup once. Checks for missed backup window and alerts, then runs backup.
 * Schedule: 0 3 * * * cd apps/api && pnpm backup:run
 */
import "dotenv/config";
import { runBackup } from "../src/workers/backupWorker";
import { getBackupStatus } from "../src/services/backupManager";
import { triggerBackupNotRunAlert } from "../src/services/systemAlerts";

const EXPECTED_BACKUP_WINDOW_HOURS = 26;

async function main() {
  const status = await getBackupStatus();
  const lastTime = status.lastBackupTime ? new Date(status.lastBackupTime) : null;
  if (lastTime) {
    const hoursSince = (Date.now() - lastTime.getTime()) / (60 * 60 * 1000);
    if (hoursSince > EXPECTED_BACKUP_WINDOW_HOURS) {
      await triggerBackupNotRunAlert(Math.round(hoursSince)).catch(() => {});
    }
  } else if (status.backupsLast7Days === 0) {
    await triggerBackupNotRunAlert(24 * 7).catch(() => {});
  }
  await runBackup();
}

main()
  .then(() => {
    console.log("[backup-run] Done");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
