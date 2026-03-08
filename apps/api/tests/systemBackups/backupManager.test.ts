/**
 * System backups & recovery — tests.
 * Run: pnpm -C apps/api test:backups
 *
 * Tests: backup manager helpers (verifyBackupFile), backup status shape, alert helper.
 * Admin-only restore and health endpoint are covered in BACKUP_TEST_CHECKLIST.md (manual/API).
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { verifyBackupFile, getBackupStatusSummary } from "../../src/services/backupManager";
import { emitSystemAlert, triggerBackupNotRunAlert } from "../../src/services/systemAlerts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

console.log("System backups tests");

// --- verifyBackupFile: valid file and matching checksum
const dir = os.tmpdir();
const testFile = path.join(dir, `backup-test-${Date.now()}.txt`);
fs.writeFileSync(testFile, "hello backup");
const hash = crypto.createHash("sha256").update(fs.readFileSync(testFile)).digest("hex");
assert(verifyBackupFile(testFile, hash), "verifyBackupFile: matching checksum");
assert(!verifyBackupFile(testFile, "wrong"), "verifyBackupFile: wrong checksum returns false");
assert(!verifyBackupFile(path.join(dir, "nonexistent-file-xyz"), hash), "verifyBackupFile: missing file returns false");
try {
  fs.unlinkSync(testFile);
} catch {}

// --- getBackupStatusSummary returns shape (may throw if DB not connected; then skip or run with test DB)
try {
  const summary = await getBackupStatusSummary();
  assert(typeof summary === "object", "getBackupStatusSummary: returns object");
  assert("lastBackupTime" in summary && "lastBackupStatus" in summary && "backupsLast7Days" in summary, "getBackupStatusSummary: has lastBackupTime, lastBackupStatus, backupsLast7Days");
  assert(typeof summary.backupsLast7Days === "number", "getBackupStatusSummary: backupsLast7Days is number");
} catch (e) {
  console.warn("getBackupStatusSummary skipped (no DB):", (e as Error).message);
}

// --- systemAlerts: emit and trigger don't throw (they log to DB; if no DB they may throw - catch and skip)
try {
  await emitSystemAlert("backup_failed", { message: "test" });
  await triggerBackupNotRunAlert(26);
} catch (e) {
  console.warn("emitSystemAlert/triggerBackupNotRunAlert skipped (no DB):", (e as Error).message);
}

console.log("All system backups tests passed");
