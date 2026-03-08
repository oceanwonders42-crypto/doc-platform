"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemHealth = getSystemHealth;
/**
 * System health for admin dashboard.
 * API, DB, worker visibility, recent errors, failed jobs, abuse/support signals, backup status.
 */
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const queue_1 = require("../services/queue");
const abuseTracking_1 = require("../services/abuseTracking");
const backupManager_1 = require("./backupManager");
const QUEUE_KEY = "doc_jobs";
async function getSystemHealth() {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let database = "down";
    try {
        await pg_1.pgPool.query("SELECT 1");
        database = "up";
    }
    catch {
        // leave down
    }
    let redisStatus = "down";
    let queueDepth = 0;
    try {
        queueDepth = await queue_1.redis.llen(QUEUE_KEY);
        redisStatus = "up";
    }
    catch {
        // leave down
    }
    let recentErrorCount = 0;
    let openErrorCount = 0;
    let recentOpenCriticalErrorsCount = 0;
    let lastErrorAt = null;
    try {
        const [recent, open, openCritical] = await Promise.all([
            prisma_1.prisma.systemErrorLog.count({ where: { createdAt: { gte: since } } }),
            prisma_1.prisma.systemErrorLog.count({ where: { status: "OPEN" } }),
            prisma_1.prisma.systemErrorLog.count({ where: { status: "OPEN", severity: "CRITICAL", createdAt: { gte: since } } }),
        ]);
        recentErrorCount = recent;
        openErrorCount = open;
        recentOpenCriticalErrorsCount = openCritical;
        const last = await prisma_1.prisma.systemErrorLog.findFirst({
            where: {},
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        });
        lastErrorAt = last?.createdAt?.toISOString() ?? null;
    }
    catch {
        // ignore
    }
    let recentFailedJobsCount = 0;
    try {
        recentFailedJobsCount = await prisma_1.prisma.job.count({
            where: { status: "failed", createdAt: { gte: since } },
        });
    }
    catch {
        // Job model may not exist
    }
    const abuse = (0, abuseTracking_1.getAbuseStats)();
    let supportBacklogCount = 0;
    try {
        supportBacklogCount = await prisma_1.prisma.appBugReport.count({ where: { status: "OPEN" } });
    }
    catch {
        // ignore
    }
    let backupStatus = {
        lastBackupTime: null,
        lastBackupStatus: null,
        backupsLast7Days: 0,
    };
    try {
        backupStatus = await (0, backupManager_1.getBackupStatusSummary)();
    }
    catch {
        // ignore if SystemBackup not migrated yet
    }
    return {
        api: "up",
        database,
        redis: redisStatus,
        recentErrorCount,
        recentFailedJobsCount,
        openErrorCount,
        recentOpenCriticalErrorsCount,
        lastErrorAt,
        queueDepth,
        rateLimitHitCount: abuse.rateLimitHitCount,
        suspiciousUploadCount: abuse.suspiciousUploadCount,
        authFailureCount: abuse.authFailureCount,
        invalidPayloadCount: abuse.invalidPayloadCount,
        supportBacklogCount,
        workerStatus: "unknown",
        backupStatus,
        timestamp: now.toISOString(),
    };
}
