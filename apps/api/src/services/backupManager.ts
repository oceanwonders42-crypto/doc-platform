/**
 * Backup manager: trigger DB backups, record metadata, verify integrity.
 * Used by backup worker and POST /admin/system/backup.
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../db/prisma";
import { logSystemError } from "./errorLog";
import { verifyBackupFile as verifyBackupFileHelper, sha256Hex } from "./backupManagerVerify";

const SERVICE = "backup-manager";

export type BackupType = "DB" | "FILE_STORAGE" | "CONFIG";
export type BackupStatus = "SUCCESS" | "FAILED";

const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

function getBackupDir(): string {
  const dir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Run pg_dump and write to a file. Returns path and size.
 * Requires pg_dump on PATH and DATABASE_URL set.
 */
async function runPgDump(): Promise<{ filePath: string; size: number }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgresql")) {
    throw new Error("DATABASE_URL not set or not a PostgreSQL URL");
  }

  const dir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filePath = path.join(dir, `db-backup-${timestamp}.sql`);

  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--no-owner", "--no-acl", databaseUrl], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    const out = fs.createWriteStream(filePath);
    child.stdout.pipe(out);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      out.destroy();
      try {
        fs.unlinkSync(filePath);
      } catch {}
      reject(new Error(`pg_dump failed: ${(err as Error).message}`));
    });

    child.on("close", (code) => {
      out.end(() => {
        if (code !== 0) {
          try {
            fs.unlinkSync(filePath);
          } catch {}
          reject(new Error(`pg_dump exited ${code}: ${stderr || "no stderr"}`));
          return;
        }
        const stat = fs.statSync(filePath);
        resolve({ filePath, size: stat.size });
      });
    });
  });
}

/** Re-export for callers that need to verify a backup file. */
export function verifyBackupFile(filePath: string, expectedChecksum: string): boolean {
  return verifyBackupFileHelper(filePath, expectedChecksum);
}

export interface TriggerBackupResult {
  id: string;
  backupType: BackupType;
  location: string;
  size: number;
  checksum: string | null;
  status: BackupStatus;
  verifiedAt: Date | null;
}

/**
 * Trigger a database backup: run pg_dump, store file, record metadata, verify.
 * On failure writes SystemErrorLog and returns a FAILED metadata record.
 */
export async function triggerDatabaseBackup(): Promise<TriggerBackupResult> {
  const id = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let filePath: string | null = null;
  let size = 0;
  let checksum: string | null = null;

  try {
    const { filePath: fp, size: sz } = await runPgDump();
    filePath = fp;
    size = sz;
    checksum = sha256Hex(fp);

    const record = await prisma.systemBackup.create({
      data: {
        id,
        backupType: "DB",
        location: filePath,
        size,
        checksum,
        status: "SUCCESS",
        verifiedAt: new Date(),
      },
    });

    const verified = verifyBackupFile(filePath, checksum);
    if (!verified) {
      await prisma.systemBackup.update({
        where: { id },
        data: { status: "FAILED", verifiedAt: null },
      });
      await logSystemError(SERVICE, "Backup checksum verification failed", undefined, {
        metaJson: { backupId: id, location: filePath },
        severity: "ERROR",
      });
      return {
        id,
        backupType: "DB",
        location: filePath,
        size,
        checksum,
        status: "FAILED",
        verifiedAt: null,
      };
    }

    return {
      id: record.id,
      backupType: "DB",
      location: record.location,
      size: record.size,
      checksum: record.checksum,
      status: record.status as BackupStatus,
      verifiedAt: record.verifiedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logSystemError(SERVICE, `Backup failed: ${message}`, err instanceof Error ? err.stack : undefined, {
      metaJson: { backupId: id, attemptedLocation: filePath },
      severity: "CRITICAL",
    });
    await prisma.systemBackup.create({
      data: {
        id,
        backupType: "DB",
        location: filePath || "unknown",
        size,
        checksum,
        status: "FAILED",
      },
    });
    return {
      id,
      backupType: "DB",
      location: filePath || "unknown",
      size,
      checksum,
      status: "FAILED",
      verifiedAt: null,
    };
  }
}

export type ListBackupsFilter = {
  backupType?: BackupType;
  status?: BackupStatus;
  since?: Date;
  until?: Date;
  limit?: number;
};

export async function listBackups(filter: ListBackupsFilter = {}): Promise<
  {
    id: string;
    backupType: string;
    location: string;
    size: number;
    checksum: string | null;
    createdAt: Date;
    verifiedAt: Date | null;
    status: string;
  }[]
> {
  const where: Record<string, unknown> = {};
  if (filter.backupType) where.backupType = filter.backupType;
  if (filter.status) where.status = filter.status;
  if (filter.since || filter.until) {
    where.createdAt = {};
    if (filter.since) (where.createdAt as Record<string, Date>).gte = filter.since;
    if (filter.until) (where.createdAt as Record<string, Date>).lte = filter.until;
  }
  const limit = Math.min(filter.limit ?? 100, 500);
  const list = await prisma.systemBackup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return list;
}

export async function getBackupById(id: string): Promise<{
  id: string;
  backupType: string;
  location: string;
  size: number;
  checksum: string | null;
  createdAt: Date;
  verifiedAt: Date | null;
  status: string;
} | null> {
  return prisma.systemBackup.findUnique({
    where: { id },
  });
}

/**
 * Restore database from a backup file (plain SQL from pg_dump). Runs psql. Caller must log incident.
 */
export async function restoreFromBackup(backupId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgresql")) {
    return { ok: false, error: "DATABASE_URL not set or not PostgreSQL" };
  }
  const backup = await getBackupById(backupId);
  if (!backup) return { ok: false, error: "Backup not found" };
  if (backup.status !== "SUCCESS") return { ok: false, error: "Backup status is not SUCCESS" };
  if (backup.backupType !== "DB") return { ok: false, error: "Only DB backups can be restored" };
  if (!fs.existsSync(backup.location)) return { ok: false, error: "Backup file not found on disk" };
  if (backup.checksum && !verifyBackupFile(backup.location, backup.checksum)) {
    return { ok: false, error: "Backup checksum verification failed" };
  }

  return new Promise((resolve) => {
    const child = spawn("psql", ["-f", backup.location, databaseUrl], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
    child.on("close", (code) => {
      if (code !== 0) resolve({ ok: false, error: stderr || `psql exited ${code}` });
      else resolve({ ok: true });
    });
  });
}

/**
 * Apply retention: keep daily backups 30 days.
 * Optionally keep weekly backups 90 days (one per week in 30–90 day window); for now we only delete older than 30 days.
 */
export async function applyRetention(): Promise<{ deleted: number; errors: string[] }> {
  const dir = getBackupDir();
  const now = new Date();
  const dailyCutoff = new Date(now);
  dailyCutoff.setDate(dailyCutoff.getDate() - 30);

  const toDelete = await prisma.systemBackup.findMany({
    where: {
      backupType: "DB",
      createdAt: { lt: dailyCutoff },
      status: "SUCCESS",
    },
    select: { id: true, location: true },
    orderBy: { createdAt: "asc" },
  });

  let deleted = 0;
  const errors: string[] = [];

  for (const row of toDelete) {
    try {
      if (row.location.startsWith(dir) && fs.existsSync(row.location)) {
        fs.unlinkSync(row.location);
      }
    } catch (e) {
      errors.push(`Failed to delete file ${row.location}: ${String((e as Error).message)}`);
    }
    try {
      await prisma.systemBackup.delete({ where: { id: row.id } });
      deleted++;
    } catch (e) {
      errors.push(`Failed to delete backup record ${row.id}: ${String((e as Error).message)}`);
    }
  }

  return { deleted, errors };
}

export type BackupStatusSummary = {
  lastBackupTime: string | null;
  lastBackupStatus: string | null;
  backupsLast7Days: number;
};

export async function getBackupStatusSummary(): Promise<BackupStatusSummary> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const [last, count] = await Promise.all([
    prisma.systemBackup.findFirst({
      where: { backupType: "DB" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true },
    }),
    prisma.systemBackup.count({
      where: { backupType: "DB", createdAt: { gte: sevenDaysAgo }, status: "SUCCESS" },
    }),
  ]);
  return {
    lastBackupTime: last?.createdAt?.toISOString() ?? null,
    lastBackupStatus: last?.status ?? null,
    backupsLast7Days: count,
  };
}

/** Alias for getBackupStatusSummary for scripts. */
export async function getBackupStatus(): Promise<BackupStatusSummary> {
  return getBackupStatusSummary();
}
