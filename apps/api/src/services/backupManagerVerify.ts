/**
 * Backup verification helpers (no DB dependency). Used by backupManager and tests.
 */
import * as crypto from "crypto";
import * as fs from "fs";

export function sha256Hex(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

/** Verify backup file exists and checksum matches. Returns true if valid. */
export function verifyBackupFile(filePath: string, expectedChecksum: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const actual = sha256Hex(filePath);
    return actual === expectedChecksum;
  } catch {
    return false;
  }
}
