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
import { prisma } from "../db/prisma";

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
  evidence: Record<string, string | number | string[] | null>;
  recommendation: string;
};

type WeeklyQueueHealthByType = DeferredJobTimingByType & {
  queuedNow: number;
  currentOldestQueuedAgeMs: number | null;
  retriedQueuedCountNow: number;
  maxQueuedAttempt: number;
};

const clioHandoffFailureOutcomes = [
  "replay_rejected_legacy",
  "replay_rejected_data_changed",
  "forced_reexport",
] as const;

type ClioHandoffFailureOutcome = (typeof clioHandoffFailureOutcomes)[number];

const clioHandoffFailureThreshold = 3;
const clioHandoffSpikeMinCurrentFailures = 6;
const clioHandoffSpikeNoHistoryMin = 10;
const clioHandoffSpikeRatio = 2;

type ClioHandoffFailureSummary = {
  count: number;
  latestAt: string | null;
  batchIds: string[];
};

function isClioHandoffFailureOutcome(value: string): value is ClioHandoffFailureOutcome {
  return clioHandoffFailureOutcomes.includes(value as ClioHandoffFailureOutcome);
}

function toClioFailureSummaryWindow(
  logs: Array<{ id: string; firmId: string | null; createdAt: Date; metaJson: unknown }>
): Map<string, { total: ClioHandoffFailureSummary; byOutcome: Map<ClioHandoffFailureOutcome, ClioHandoffFailureSummary> }> {
  const byFirm = new Map<string, { total: ClioHandoffFailureSummary; byOutcome: Map<ClioHandoffFailureOutcome, ClioHandoffFailureSummary> }>();

  for (const entry of logs) {
    const firmId = entry.firmId?.trim();
    if (!firmId) {
      continue;
    }

    const meta = (entry.metaJson ?? {}) as Record<string, unknown>;
    const outcome = typeof meta.outcomeType === "string" ? meta.outcomeType : null;
    const batchId = typeof meta.batchId === "string" && meta.batchId.trim() ? meta.batchId.trim() : null;

    if (!outcome || !isClioHandoffFailureOutcome(outcome)) {
      continue;
    }

    const createdAt = entry.createdAt.toISOString();
    const summary = byFirm.get(firmId) ?? {
      total: { count: 0, latestAt: null, batchIds: [] },
      byOutcome: new Map<ClioHandoffFailureOutcome, ClioHandoffFailureSummary>(),
    };

    const byOutcome = summary.byOutcome.get(outcome) ?? {
      count: 0,
      latestAt: null,
      batchIds: [],
    };

    byOutcome.count += 1;
    if (summary.total.latestAt === null || createdAt > summary.total.latestAt) {
      summary.total.latestAt = createdAt;
    }
    summary.total.count += 1;
    if (summary.total.batchIds.length < 3 && batchId && !summary.total.batchIds.includes(batchId)) {
      summary.total.batchIds.push(batchId);
    }
    if (byOutcome.latestAt === null || createdAt > byOutcome.latestAt) {
      byOutcome.latestAt = createdAt;
    }
    if (byOutcome.batchIds.length < 3 && batchId && !byOutcome.batchIds.includes(batchId)) {
      byOutcome.batchIds.push(batchId);
    }

    summary.byOutcome.set(outcome, byOutcome);
    if (!byFirm.has(firmId)) {
      byFirm.set(firmId, summary);
    }
  }

  return byFirm;
}

function getClioHandoffFailureRows(params: {
  from: Date;
  to: Date;
  firmId?: string | null;
}): Promise<Array<{ id: string; firmId: string | null; createdAt: Date; metaJson: unknown }>> {
  const whereClause: { area: string; firmId?: string; createdAt: { gte: Date; lt: Date } } = {
    area: "clio_handoff_audit",
    createdAt: {
      gte: params.from,
      lt: params.to,
    },
  };
  if (params.firmId) {
    whereClause.firmId = params.firmId;
  }

  return prisma.systemErrorLog.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firmId: true,
      createdAt: true,
      metaJson: true,
    },
  });
}

function addClioHandoffAnomalies(
  currentSummary: Map<string, { total: ClioHandoffFailureSummary; byOutcome: Map<ClioHandoffFailureOutcome, ClioHandoffFailureSummary> }>,
  previousSummary: Map<string, { total: ClioHandoffFailureSummary; byOutcome: Map<ClioHandoffFailureOutcome, ClioHandoffFailureSummary> }>,
  anomalies: WeeklyOperatorAnomaly[]
) {
  for (const [firmId, summary] of currentSummary.entries()) {
    for (const [outcome, outcomeSummary] of summary.byOutcome.entries()) {
      if (outcomeSummary.count >= clioHandoffFailureThreshold) {
        anomalies.push({
          severity: "warning",
          code: `clio_handoff_${outcome}`,
          summary: `Firm ${firmId} has repeated Clio handoff ${outcome.replace(/_/g, " ")} outcomes.`,
          evidence: {
            firmId,
            outcomeType: outcome,
            currentWindowCount: outcomeSummary.count,
            latestFailureAt: outcomeSummary.latestAt,
            sampleBatchIds: outcomeSummary.batchIds,
          },
          recommendation: "Review recent migration handoff failures for this batch pattern before continuing exports.",
        });
      }
    }

    const currentFailures = summary.total.count;
    if (currentFailures >= clioHandoffSpikeMinCurrentFailures) {
      const previousFailures = previousSummary.get(firmId)?.total.count ?? 0;
      const noHistoryAlert = previousFailures === 0 && currentFailures >= clioHandoffSpikeNoHistoryMin;
      const ratioAlert =
        previousFailures > 0 && currentFailures / previousFailures >= clioHandoffSpikeRatio;

      if (noHistoryAlert || ratioAlert) {
        anomalies.push({
          severity: "warning",
          code: "clio_handoff_firm_failure_spike",
          summary: `Firm ${firmId} has an unusual spike in Clio handoff failures this week.`,
          evidence: {
            firmId,
            currentFailureCount: currentFailures,
            previousFailureCount: previousFailures,
            latestFailureAt: summary.total.latestAt,
            sampleBatchIds: summary.total.batchIds,
          },
          recommendation: "Check whether affected batches share the same manifest/idempotency state before retrying.",
        });
      }
    }
  }
}

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
  clioHandoffCurrent: Map<string, { total: ClioHandoffFailureSummary; byOutcome: Map<ClioHandoffFailureOutcome, ClioHandoffFailureSummary> }>;
  clioHandoffPrevious: Map<string, { total: ClioHandoffFailureSummary; byOutcome: Map<ClioHandoffFailureOutcome, ClioHandoffFailureSummary> }>;
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

  addClioHandoffAnomalies(params.clioHandoffCurrent, params.clioHandoffPrevious, anomalies);

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
    clioHandoffCurrentRows,
    clioHandoffPreviousRows,
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
    getClioHandoffFailureRows({
      from: currentWindow.fromDate,
      to: currentWindow.toDate,
      firmId: scopedFirmId,
    }),
    getClioHandoffFailureRows({
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
    clioHandoffCurrent: toClioFailureSummaryWindow(clioHandoffCurrentRows),
    clioHandoffPrevious: toClioFailureSummaryWindow(clioHandoffPreviousRows),
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
