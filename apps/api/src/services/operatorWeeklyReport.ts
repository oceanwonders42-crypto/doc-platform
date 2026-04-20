import {
  getAiCacheHitRates,
  getAiCostLeaderboard,
  getAiCostSummary,
  getAiCostTimeseries,
  type AiCacheHitRateEntry,
  type AiCostEntitySummary,
  type AiCostLeaderboardEntry,
  type AiCostTimeseriesPoint,
  type AiCostTaskBreakdown,
} from "./aiTaskTelemetry";
import {
  DEFERRED_JOB_TYPES,
  getDeferredJobTelemetryOverview,
  type DeferredJobTelemetryOverview,
  type DeferredJobTimingByType,
} from "./deferredJobTelemetry";
import { getRedisQueueSnapshot, type QueueSnapshot } from "./queue";

type ReportScope = "global" | "firm";

type WeeklyWindow = {
  from: string;
  to: string;
  days: number;
};

type WeeklyOperatorAnomaly = {
  severity: "info" | "warning" | "critical";
  code: string;
  summary: string;
  evidence: Record<string, number | string | null>;
  recommendation: string;
};

type WeeklyQueueHealthByType = DeferredJobTimingByType & {
  queuedNow: number;
  currentOldestQueuedAgeMs: number | null;
  retriedQueuedCountNow: number;
  maxQueuedAttempt: number;
};

type WeeklyOperatorSavings = {
  cacheSavedCostUsd: number;
  cacheSavedCount: number;
  dedupeAvoidedCount: number;
  topCacheSavedTasks: AiCostTaskBreakdown[];
  topDedupeAvoidedTasks: AiCostTaskBreakdown[];
};

export type WeeklyOperatorReport = {
  generatedAt: string;
  kind: "weekly_operator_report";
  scope: ReportScope;
  firmId: string | null;
  window: {
    current: WeeklyWindow;
    previous: WeeklyWindow;
  };
  queue: {
    snapshot: QueueSnapshot;
    summary: DeferredJobTelemetryOverview["summary"];
    previousSummary: DeferredJobTelemetryOverview["summary"];
    byJobType: WeeklyQueueHealthByType[];
    ocr: {
      current: WeeklyQueueHealthByType | null;
      previous: DeferredJobTimingByType | null;
    };
  };
  cost: {
    summary: AiCostEntitySummary["totals"];
    previousSummary: AiCostEntitySummary["totals"];
    byTask: AiCostTaskBreakdown[];
    cacheHitRates: AiCacheHitRateEntry[];
    daily: AiCostTimeseriesPoint[];
    topDocuments: AiCostLeaderboardEntry[];
    topFirms: AiCostLeaderboardEntry[];
  };
  savings: WeeklyOperatorSavings;
  anomalies: WeeklyOperatorAnomaly[];
};

type BuildWeeklyOperatorReportParams = {
  scope: ReportScope;
  firmId?: string | null;
  days?: number;
  now?: Date;
  queueSnapshot?: QueueSnapshot;
};

function roundMetric(value: number | null | undefined): number {
  return Number(((value ?? 0) as number).toFixed(2));
}

function getWindow(now: Date, days: number, offsetDays = 0): WeeklyWindow & { fromDate: Date; toDate: Date } {
  const end = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    days,
    fromDate: start,
    toDate: end,
  };
}

function zeroDeferredTiming(jobType: (typeof DEFERRED_JOB_TYPES)[number]): DeferredJobTimingByType {
  return {
    jobType,
    attempts: 0,
    successCount: 0,
    failureCount: 0,
    retriedCount: 0,
    avgWaitMs: 0,
    p95WaitMs: 0,
    oldestWaitMs: 0,
    avgRunMs: 0,
    p95RunMs: 0,
    avgAttempt: 0,
    maxAttempt: 0,
    lastFinishedAt: null,
  };
}

function mergeQueueAndTelemetry(
  queueSnapshot: QueueSnapshot,
  currentOverview: DeferredJobTelemetryOverview
): WeeklyQueueHealthByType[] {
  const byType = new Map(currentOverview.byType.map((entry) => [entry.jobType, entry]));

  return DEFERRED_JOB_TYPES.map((jobType) => {
    const timing = byType.get(jobType) ?? zeroDeferredTiming(jobType);
    const queued = queueSnapshot.byType[jobType];

    return {
      ...timing,
      queuedNow: queued?.queued ?? 0,
      currentOldestQueuedAgeMs: queued?.oldestAgeMs ?? null,
      retriedQueuedCountNow: queued?.retriedQueuedCount ?? 0,
      maxQueuedAttempt: queued?.maxAttempt ?? 0,
    };
  });
}

function getJobTypeEntry<T extends { jobType: string }>(entries: T[], jobType: string): T | null {
  return entries.find((entry) => entry.jobType === jobType) ?? null;
}

function getTopCacheSavedTasks(byTask: AiCostTaskBreakdown[]): AiCostTaskBreakdown[] {
  return [...byTask]
    .filter((entry) => entry.cacheSavedCostUsd > 0)
    .sort((left, right) => right.cacheSavedCostUsd - left.cacheSavedCostUsd || right.cacheSavedCount - left.cacheSavedCount)
    .slice(0, 5);
}

function getTopDedupeAvoidedTasks(byTask: AiCostTaskBreakdown[]): AiCostTaskBreakdown[] {
  return [...byTask]
    .filter((entry) => entry.dedupeAvoidedCount > 0)
    .sort((left, right) => right.dedupeAvoidedCount - left.dedupeAvoidedCount || right.executedCostUsd - left.executedCostUsd)
    .slice(0, 5);
}

function compareRatio(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }

  return roundMetric(current / previous);
}

function buildAnomalies(params: {
  queueSnapshot: QueueSnapshot;
  currentDeferred: DeferredJobTelemetryOverview;
  previousDeferred: DeferredJobTelemetryOverview;
  currentCost: AiCostEntitySummary["totals"];
  previousCost: AiCostEntitySummary["totals"];
  cacheHitRates: AiCacheHitRateEntry[];
}): WeeklyOperatorAnomaly[] {
  const anomalies: WeeklyOperatorAnomaly[] = [];
  const currentOcr = getJobTypeEntry(params.currentDeferred.byType, "ocr");
  const previousOcr = getJobTypeEntry(params.previousDeferred.byType, "ocr");

  if (params.currentDeferred.summary.failureCount > 0) {
    anomalies.push({
      severity: "critical",
      code: "deferred_failures_present",
      summary: "Deferred jobs recorded live failures during the current weekly window.",
      evidence: {
        failureCount: params.currentDeferred.summary.failureCount,
        retriedCount: params.currentDeferred.summary.retriedCount,
      },
      recommendation: "Inspect failing job types first and confirm retries are not masking a persistent runtime issue.",
    });
  }

  if ((params.queueSnapshot.oldestJobAgeMs ?? 0) >= 5 * 60 * 1000 || params.currentDeferred.summary.oldestWaitMs >= 5 * 60 * 1000) {
    anomalies.push({
      severity: "warning",
      code: "queue_backlog_age_high",
      summary: "Queue age crossed the operator backlog threshold.",
      evidence: {
        oldestQueuedAgeMs: params.queueSnapshot.oldestJobAgeMs,
        oldestDeferredWaitMs: params.currentDeferred.summary.oldestWaitMs,
        queueDepth: params.queueSnapshot.queueDepth,
      },
      recommendation: "Check whether OCR-heavy work is crowding out lighter jobs and confirm the queue is draining normally.",
    });
  }

  if (currentOcr && previousOcr) {
    const waitRatio = compareRatio(currentOcr.p95WaitMs, previousOcr.p95WaitMs);
    const runRatio = compareRatio(currentOcr.p95RunMs, previousOcr.p95RunMs);

    if (waitRatio != null && waitRatio >= 1.5) {
      anomalies.push({
        severity: "warning",
        code: "ocr_wait_regression",
        summary: "OCR p95 wait time regressed materially versus the previous weekly window.",
        evidence: {
          currentP95WaitMs: currentOcr.p95WaitMs,
          previousP95WaitMs: previousOcr.p95WaitMs,
          ratio: waitRatio,
          attempts: currentOcr.attempts,
        },
        recommendation: "Keep OCR isolation in place and inspect OCR host contention before increasing worker parallelism again.",
      });
    }

    if (runRatio != null && runRatio >= 1.5) {
      anomalies.push({
        severity: "warning",
        code: "ocr_runtime_regression",
        summary: "OCR p95 runtime regressed materially versus the previous weekly window.",
        evidence: {
          currentP95RunMs: currentOcr.p95RunMs,
          previousP95RunMs: previousOcr.p95RunMs,
          ratio: runRatio,
          attempts: currentOcr.attempts,
        },
        recommendation: "Profile OCR runtime dependencies and confirm Tesseract + image preprocessing are healthy on the current host.",
      });
    }
  }

  if (
    params.previousDeferred.summary.retriedCount > 0
      ? params.currentDeferred.summary.retriedCount >= params.previousDeferred.summary.retriedCount * 2
      : params.currentDeferred.summary.retriedCount >= 3
  ) {
    anomalies.push({
      severity: "warning",
      code: "retry_spike",
      summary: "Deferred job retries are elevated relative to the previous weekly window.",
      evidence: {
        currentRetriedCount: params.currentDeferred.summary.retriedCount,
        previousRetriedCount: params.previousDeferred.summary.retriedCount,
        currentFailureCount: params.currentDeferred.summary.failureCount,
      },
      recommendation: "Review retry-heavy job types and confirm there is no hidden runtime instability or duplicate requeue pressure.",
    });
  }

  const costRatio = compareRatio(params.currentCost.executedCostUsd, params.previousCost.executedCostUsd);
  if (costRatio != null && costRatio >= 1.5) {
    anomalies.push({
      severity: "info",
      code: "ai_cost_increase",
      summary: "Executed AI cost increased materially versus the previous weekly window.",
      evidence: {
        currentExecutedCostUsd: params.currentCost.executedCostUsd,
        previousExecutedCostUsd: params.previousCost.executedCostUsd,
        ratio: costRatio,
      },
      recommendation: "Check which task types are driving the increase and whether cache reuse or dedupe savings are keeping pace.",
    });
  }

  if (params.currentCost.executedCostUsd > 0 && params.currentCost.cacheSavedCostUsd === 0) {
    anomalies.push({
      severity: "info",
      code: "cache_savings_absent",
      summary: "Executed AI work is present but no cache-saved cost was recorded this week.",
      evidence: {
        executedCostUsd: params.currentCost.executedCostUsd,
        cacheSavedCostUsd: params.currentCost.cacheSavedCostUsd,
      },
      recommendation: "Verify repeated document/explain paths are reusing cache keys as expected and that taskCache metadata is present.",
    });
  }

  if (params.cacheHitRates.length === 0) {
    anomalies.push({
      severity: "info",
      code: "cache_hit_rate_unobserved",
      summary: "No cache-hit rate entries were recorded in the current weekly window.",
      evidence: {
        cacheHitRateEntries: 0,
        executedCostUsd: params.currentCost.executedCostUsd,
      },
      recommendation: "Treat this as low-signal unless repeated work should already be happening; otherwise confirm cache telemetry is still flowing.",
    });
  }

  return anomalies;
}

export async function buildWeeklyOperatorReport(
  params: BuildWeeklyOperatorReportParams
): Promise<WeeklyOperatorReport> {
  const now = params.now ?? new Date();
  const days = Math.max(1, Math.min(params.days ?? 7, 28));
  const currentWindow = getWindow(now, days);
  const previousWindow = getWindow(currentWindow.fromDate, days);
  const scopedFirmId = params.scope === "firm" ? params.firmId ?? null : null;

  const [
    queueSnapshot,
    currentDeferred,
    previousDeferred,
    currentCost,
    previousCost,
    cacheHitRates,
    dailyCost,
    topDocuments,
    topFirms,
  ] = await Promise.all([
    params.queueSnapshot ?? getRedisQueueSnapshot(),
    getDeferredJobTelemetryOverview({
      from: currentWindow.fromDate,
      to: currentWindow.toDate,
      firmId: scopedFirmId,
    }),
    getDeferredJobTelemetryOverview({
      from: previousWindow.fromDate,
      to: previousWindow.toDate,
      firmId: scopedFirmId,
    }),
    getAiCostSummary({
      from: currentWindow.fromDate,
      to: currentWindow.toDate,
      firmId: scopedFirmId,
    }),
    getAiCostSummary({
      from: previousWindow.fromDate,
      to: previousWindow.toDate,
      firmId: scopedFirmId,
    }),
    getAiCacheHitRates({
      from: currentWindow.fromDate,
      to: currentWindow.toDate,
      firmId: scopedFirmId,
    }).then((rows) => rows.filter((entry) => entry.executedCount > 0 || entry.cacheHitCount > 0)),
    getAiCostTimeseries({
      bucket: "day",
      from: currentWindow.fromDate,
      to: currentWindow.toDate,
      firmId: scopedFirmId,
    }),
    getAiCostLeaderboard({
      groupBy: "document",
      from: currentWindow.fromDate,
      to: currentWindow.toDate,
      firmId: scopedFirmId,
      limit: 10,
    }),
    getAiCostLeaderboard({
      groupBy: "firm",
      from: currentWindow.fromDate,
      to: currentWindow.toDate,
      firmId: scopedFirmId,
      limit: 10,
    }),
  ]);

  const queueByJobType = mergeQueueAndTelemetry(queueSnapshot, currentDeferred);
  const anomalies = buildAnomalies({
    queueSnapshot,
    currentDeferred,
    previousDeferred,
    currentCost: currentCost.totals,
    previousCost: previousCost.totals,
    cacheHitRates,
  });

  return {
    generatedAt: now.toISOString(),
    kind: "weekly_operator_report",
    scope: params.scope,
    firmId: scopedFirmId,
    window: {
      current: {
        from: currentWindow.from,
        to: currentWindow.to,
        days: currentWindow.days,
      },
      previous: {
        from: previousWindow.from,
        to: previousWindow.to,
        days: previousWindow.days,
      },
    },
    queue: {
      snapshot: queueSnapshot,
      summary: currentDeferred.summary,
      previousSummary: previousDeferred.summary,
      byJobType: queueByJobType,
      ocr: {
        current: getJobTypeEntry(queueByJobType, "ocr"),
        previous: getJobTypeEntry(previousDeferred.byType, "ocr"),
      },
    },
    cost: {
      summary: currentCost.totals,
      previousSummary: previousCost.totals,
      byTask: currentCost.byTask,
      cacheHitRates,
      daily: dailyCost,
      topDocuments,
      topFirms,
    },
    savings: {
      cacheSavedCostUsd: roundMetric(currentCost.totals.cacheSavedCostUsd),
      cacheSavedCount: currentCost.totals.cacheSavedCount,
      dedupeAvoidedCount: currentCost.totals.dedupeAvoidedCount,
      topCacheSavedTasks: getTopCacheSavedTasks(currentCost.byTask),
      topDedupeAvoidedTasks: getTopDedupeAvoidedTasks(currentCost.byTask),
    },
    anomalies,
  };
}
