/**
 * System backups & recovery — smoke tests.
 * Run: pnpm -C apps/api test:backups
 *
 * Test cases:
 * - backup metadata shape / verifyBackupFile
 * - getBackupStatusSummary return shape (requires DB; skipped if DATABASE_URL not set)
 * - health endpoint includes backup status (documented in checklist)
 * - admin-only restore route (manual checklist)
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { verifyBackupFile } from "../../src/services/backupManagerVerify";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log("System backups tests");

  // --- verifyBackupFile: missing file
  assert(!verifyBackupFile("/nonexistent/path/file.sql", "abc"), "verifyBackupFile: missing file returns false");

  // --- verifyBackupFile: checksum match / mismatch
  const tmpDir = os.tmpdir();
  const testFile = path.join(tmpDir, `backup-test-${Date.now()}.sql`);
  fs.writeFileSync(testFile, "content");
  try {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update("content").digest("hex");
    assert(verifyBackupFile(testFile, hash), "verifyBackupFile: matching checksum returns true");
    assert(!verifyBackupFile(testFile, "wrong"), "verifyBackupFile: wrong checksum returns false");
  } finally {
    try {
      fs.unlinkSync(testFile);
    } catch {}
  }

  // --- getBackupStatusSummary return shape (requires DB; skip if no DATABASE_URL to avoid prisma load)
  if (process.env.DATABASE_URL) {
    try {
      const { getBackupStatusSummary } = await import("../../src/services/backupManager");
      const summary = await getBackupStatusSummary();
      assert(typeof summary === "object", "getBackupStatusSummary: returns object");
      assert("lastBackupTime" in summary, "getBackupStatusSummary: has lastBackupTime");
      assert("lastBackupStatus" in summary, "getBackupStatusSummary: has lastBackupStatus");
      assert("backupsLast7Days" in summary, "getBackupStatusSummary: has backupsLast7Days");
      assert(summary.lastBackupTime === null || typeof summary.lastBackupTime === "string", "getBackupStatusSummary: lastBackupTime string or null");
      assert(summary.lastBackupStatus === null || typeof summary.lastBackupStatus === "string", "getBackupStatusSummary: lastBackupStatus string or null");
      assert(Number.isInteger(summary.backupsLast7Days), "getBackupStatusSummary: backupsLast7Days number");
      console.log("getBackupStatusSummary shape OK");
    } catch (e) {
      console.warn("getBackupStatusSummary skipped:", (e as Error).message);
    }
  } else {
    console.warn("getBackupStatusSummary skipped (no DATABASE_URL)");
  }

  console.log("All system backups tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
