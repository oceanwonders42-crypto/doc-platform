/**
 * System health for admin dashboard.
 * API, DB, worker visibility, recent errors, failed jobs, abuse/support signals, backup status.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { redis } from "../services/queue";
import { getAbuseStats } from "../services/abuseTracking";
import { getBackupStatusSummary } from "./backupManager";

const QUEUE_KEY = "doc_jobs";

export type BackupStatusInfo = {
  lastBackupTime: string | null;
  lastBackupStatus: string | null;
  backupsLast7Days: number;
};

export type HealthSummary = {
  api: "up";
  database: "up" | "down";
  redis: "up" | "down";
  recentErrorCount: number;
  recentFailedJobsCount: number;
  openErrorCount: number;
  recentOpenCriticalErrorsCount: number;
  lastErrorAt: string | null;
  queueDepth: number;
  rateLimitHitCount: number;
  suspiciousUploadCount: number;
  authFailureCount: number;
  invalidPayloadCount: number;
  supportBacklogCount: number;
  workerStatus: "up" | "down" | "unknown";
  backupStatus: BackupStatusInfo;
  timestamp: string;
};

export async function getSystemHealth(): Promise<HealthSummary> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let database: "up" | "down" = "down";
  try {
    await pgPool.query("SELECT 1");
    database = "up";
  } catch {
    // leave down
  }

  let redisStatus: "up" | "down" = "down";
  let queueDepth = 0;
  try {
    queueDepth = await redis.llen(QUEUE_KEY);
    redisStatus = "up";
  } catch {
    // leave down
  }

  let recentErrorCount = 0;
  let openErrorCount = 0;
  let recentOpenCriticalErrorsCount = 0;
  let lastErrorAt: string | null = null;
  try {
    const [recent, open, openCritical] = await Promise.all([
      prisma.systemErrorLog.count({ where: { createdAt: { gte: since } } }),
      prisma.systemErrorLog.count({ where: { status: "OPEN" } }),
      prisma.systemErrorLog.count({ where: { status: "OPEN", severity: "CRITICAL", createdAt: { gte: since } } }),
    ]);
    recentErrorCount = recent;
    openErrorCount = open;
    recentOpenCriticalErrorsCount = openCritical;
    const last = await prisma.systemErrorLog.findFirst({
      where: {},
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    lastErrorAt = last?.createdAt?.toISOString() ?? null;
  } catch {
    // ignore
  }

  let recentFailedJobsCount = 0;
  try {
    recentFailedJobsCount = await prisma.job.count({
      where: { status: "failed", createdAt: { gte: since } },
    });
  } catch {
    // Job model may not exist
  }

  const abuse = getAbuseStats();

  let supportBacklogCount = 0;
  try {
    supportBacklogCount = await prisma.appBugReport.count({ where: { status: "OPEN" } });
  } catch {
    // ignore
  }

  let backupStatus: BackupStatusInfo = {
    lastBackupTime: null,
    lastBackupStatus: null,
    backupsLast7Days: 0,
  };
  try {
    backupStatus = await getBackupStatusSummary();
  } catch {
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
