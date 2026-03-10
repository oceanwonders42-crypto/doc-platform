"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBackupFile = verifyBackupFile;
exports.triggerDatabaseBackup = triggerDatabaseBackup;
exports.listBackups = listBackups;
exports.getBackupById = getBackupById;
exports.restoreFromBackup = restoreFromBackup;
exports.applyRetention = applyRetention;
exports.getBackupStatusSummary = getBackupStatusSummary;
exports.getBackupStatus = getBackupStatus;
/**
 * Backup manager: trigger DB backups, record metadata, verify integrity.
 * Used by backup worker and POST /admin/system/backup.
 */
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const prisma_1 = require("../db/prisma");
const errorLog_1 = require("./errorLog");
const backupManagerVerify_1 = require("./backupManagerVerify");
const SERVICE = "backup-manager";
const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
function getBackupDir() {
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
async function runPgDump() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || !databaseUrl.startsWith("postgresql")) {
        throw new Error("DATABASE_URL not set or not a PostgreSQL URL");
    }
    const dir = getBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filePath = path.join(dir, `db-backup-${timestamp}.sql`);
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)("pg_dump", ["--no-owner", "--no-acl", databaseUrl], {
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
            }
            catch { }
            reject(new Error(`pg_dump failed: ${err.message}`));
        });
        child.on("close", (code) => {
            out.end(() => {
                if (code !== 0) {
                    try {
                        fs.unlinkSync(filePath);
                    }
                    catch { }
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
function verifyBackupFile(filePath, expectedChecksum) {
    return (0, backupManagerVerify_1.verifyBackupFile)(filePath, expectedChecksum);
}
/**
 * Trigger a database backup: run pg_dump, store file, record metadata, verify.
 * On failure writes SystemErrorLog and returns a FAILED metadata record.
 */
async function triggerDatabaseBackup() {
    const id = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let filePath = null;
    let size = 0;
    let checksum = null;
    try {
        const { filePath: fp, size: sz } = await runPgDump();
        filePath = fp;
        size = sz;
        checksum = (0, backupManagerVerify_1.sha256Hex)(fp);
        const record = await prisma_1.prisma.systemBackup.create({
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
            await prisma_1.prisma.systemBackup.update({
                where: { id },
                data: { status: "FAILED", verifiedAt: null },
            });
            await (0, errorLog_1.logSystemError)(SERVICE, "Backup checksum verification failed", undefined, {
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
            status: record.status,
            verifiedAt: record.verifiedAt,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await (0, errorLog_1.logSystemError)(SERVICE, `Backup failed: ${message}`, err instanceof Error ? err.stack : undefined, {
            metaJson: { backupId: id, attemptedLocation: filePath },
            severity: "CRITICAL",
        });
        await prisma_1.prisma.systemBackup.create({
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
async function listBackups(filter = {}) {
    const where = {};
    if (filter.backupType)
        where.backupType = filter.backupType;
    if (filter.status)
        where.status = filter.status;
    if (filter.since || filter.until) {
        where.createdAt = {};
        if (filter.since)
            where.createdAt.gte = filter.since;
        if (filter.until)
            where.createdAt.lte = filter.until;
    }
    const limit = Math.min(filter.limit ?? 100, 500);
    const list = await prisma_1.prisma.systemBackup.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    return list;
}
async function getBackupById(id) {
    return prisma_1.prisma.systemBackup.findUnique({
        where: { id },
    });
}
/**
 * Restore database from a backup file (plain SQL from pg_dump). Runs psql. Caller must log incident.
 */
async function restoreFromBackup(backupId) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || !databaseUrl.startsWith("postgresql")) {
        return { ok: false, error: "DATABASE_URL not set or not PostgreSQL" };
    }
    const backup = await getBackupById(backupId);
    if (!backup)
        return { ok: false, error: "Backup not found" };
    if (backup.status !== "SUCCESS")
        return { ok: false, error: "Backup status is not SUCCESS" };
    if (backup.backupType !== "DB")
        return { ok: false, error: "Only DB backups can be restored" };
    if (!fs.existsSync(backup.location))
        return { ok: false, error: "Backup file not found on disk" };
    if (backup.checksum && !verifyBackupFile(backup.location, backup.checksum)) {
        return { ok: false, error: "Backup checksum verification failed" };
    }
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)("psql", ["-f", backup.location, databaseUrl], {
            stdio: ["ignore", "pipe", "pipe"],
            shell: process.platform === "win32",
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        child.on("error", (err) => resolve({ ok: false, error: err.message }));
        child.on("close", (code) => {
            if (code !== 0)
                resolve({ ok: false, error: stderr || `psql exited ${code}` });
            else
                resolve({ ok: true });
        });
    });
}
/**
 * Apply retention: keep daily backups 30 days.
 * Optionally keep weekly backups 90 days (one per week in 30–90 day window); for now we only delete older than 30 days.
 */
async function applyRetention() {
    const dir = getBackupDir();
    const now = new Date();
    const dailyCutoff = new Date(now);
    dailyCutoff.setDate(dailyCutoff.getDate() - 30);
    const toDelete = await prisma_1.prisma.systemBackup.findMany({
        where: {
            backupType: "DB",
            createdAt: { lt: dailyCutoff },
            status: "SUCCESS",
        },
        select: { id: true, location: true },
        orderBy: { createdAt: "asc" },
    });
    let deleted = 0;
    const errors = [];
    for (const row of toDelete) {
        try {
            if (row.location.startsWith(dir) && fs.existsSync(row.location)) {
                fs.unlinkSync(row.location);
            }
        }
        catch (e) {
            errors.push(`Failed to delete file ${row.location}: ${String(e.message)}`);
        }
        try {
            await prisma_1.prisma.systemBackup.delete({ where: { id: row.id } });
            deleted++;
        }
        catch (e) {
            errors.push(`Failed to delete backup record ${row.id}: ${String(e.message)}`);
        }
    }
    return { deleted, errors };
}
async function getBackupStatusSummary() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [last, count] = await Promise.all([
        prisma_1.prisma.systemBackup.findFirst({
            where: { backupType: "DB" },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true, status: true },
        }),
        prisma_1.prisma.systemBackup.count({
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
async function getBackupStatus() {
    return getBackupStatusSummary();
}
