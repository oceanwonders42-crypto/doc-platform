import crypto from "crypto";
import { Prisma } from "@prisma/client";

import { pgPool } from "../db/pg";
import { logWarn } from "../lib/logger";

export const DEFERRED_JOB_TYPES = [
  "ocr",
  "classification",
  "extraction",
  "case_match",
  "timeline_rebuild",
  "post_route_sync",
] as const;

export type DeferredJobType = (typeof DEFERRED_JOB_TYPES)[number];
export type DeferredJobOutcome = "success" | "failed";

type DeferredJobTelemetryInput = {
  firmId?: string | null;
  documentId?: string | null;
  caseId?: string | null;
  jobType: DeferredJobType;
  action?: string | null;
  dedupeKey?: string | null;
  workerLabel?: string | null;
  queuedAt?: Date | string | null;
  startedAt: Date | string;
  finishedAt: Date | string;
  attempt?: number | null;
  outcome: DeferredJobOutcome;
  errorMessage?: string | null;
  meta?: Prisma.InputJsonValue | null;
};

type DeferredJobTelemetryFilters = {
  from?: Date | null;
  to?: Date | null;
  firmId?: string | null;
  documentId?: string | null;
  caseId?: string | null;
  jobType?: DeferredJobType | null;
};

export type DeferredJobTimingSummary = {
  attempts: number;
  successCount: number;
  failureCount: number;
  retriedCount: number;
  avgWaitMs: number;
  p95WaitMs: number;
  oldestWaitMs: number;
  avgRunMs: number;
  p95RunMs: number;
  avgAttempt: number;
  maxAttempt: number;
};

export type DeferredJobTimingByType = DeferredJobTimingSummary & {
  jobType: DeferredJobType;
  lastFinishedAt: string | null;
};

export type DeferredJobTelemetryOverview = {
  window: {
    from: string | null;
    to: string | null;
  };
  summary: DeferredJobTimingSummary;
  byType: DeferredJobTimingByType[];
};

type AggregateRow = {
  jobType: DeferredJobType;
  attempts: number;
  successCount: number;
  failureCount: number;
  retriedCount: number;
  avgWaitMs: number;
  p95WaitMs: number;
  oldestWaitMs: number;
  avgRunMs: number;
  p95RunMs: number;
  avgAttempt: number;
  maxAttempt: number;
  lastFinishedAt: string | null;
};

function normalizeNullableString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAttempt(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

function sanitizeErrorMessage(errorMessage: string | null | undefined): string | null {
  if (typeof errorMessage !== "string") return null;
  const trimmed = errorMessage.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 4000) : null;
}

function coerceDate(value: Date | string | null | undefined, fallback?: Date): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  if (fallback) {
    return fallback;
  }

  throw new Error("Invalid deferred job telemetry date");
}

function diffMs(start: Date, end: Date): number {
  return Math.max(0, end.getTime() - start.getTime());
}

function roundMetric(value: number | null | undefined): number {
  return Number(((value ?? 0) as number).toFixed(2));
}

function zeroSummary(): DeferredJobTimingSummary {
  return {
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
  };
}

function normalizeAggregateRow(row: Record<string, unknown>): DeferredJobTimingByType {
  return {
    jobType: String(row.jobType) as DeferredJobType,
    attempts: Number(row.attempts ?? 0),
    successCount: Number(row.successCount ?? 0),
    failureCount: Number(row.failureCount ?? 0),
    retriedCount: Number(row.retriedCount ?? 0),
    avgWaitMs: roundMetric(Number(row.avgWaitMs ?? 0)),
    p95WaitMs: roundMetric(Number(row.p95WaitMs ?? 0)),
    oldestWaitMs: Number(row.oldestWaitMs ?? 0),
    avgRunMs: roundMetric(Number(row.avgRunMs ?? 0)),
    p95RunMs: roundMetric(Number(row.p95RunMs ?? 0)),
    avgAttempt: roundMetric(Number(row.avgAttempt ?? 0)),
    maxAttempt: Number(row.maxAttempt ?? 0),
    lastFinishedAt: row.lastFinishedAt == null ? null : String(row.lastFinishedAt),
  };
}

async function safeCreateTelemetry(data: {
  firmId: string | null;
  documentId: string | null;
  caseId: string | null;
  jobType: DeferredJobType;
  action: string | null;
  dedupeKey: string | null;
  workerLabel: string | null;
  queuedAt: Date;
  startedAt: Date;
  finishedAt: Date;
  waitMs: number;
  runMs: number;
  attempt: number;
  success: boolean;
  errorMessage: string | null;
  meta: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}): Promise<void> {
  try {
    await pgPool.query(
      `
      insert into "DeferredJobTelemetry"
        (id, "firmId", "documentId", "caseId", "jobType", action, "dedupeKey", "workerLabel",
         "queuedAt", "startedAt", "finishedAt", "waitMs", "runMs", attempt, success, "errorMessage", meta)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      [
        crypto.randomUUID(),
        data.firmId,
        data.documentId,
        data.caseId,
        data.jobType,
        data.action,
        data.dedupeKey,
        data.workerLabel,
        data.queuedAt,
        data.startedAt,
        data.finishedAt,
        data.waitMs,
        data.runMs,
        data.attempt,
        data.success,
        data.errorMessage,
        data.meta === Prisma.JsonNull ? null : data.meta,
      ]
    );
  } catch (error) {
    logWarn("deferred_job_telemetry_write_failed", {
      jobType: data.jobType,
      success: data.success,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildWhereSql(filters: DeferredJobTelemetryFilters) {
  const conditions = ["1 = 1"];
  const values: unknown[] = [];

  if (filters.from) {
    values.push(filters.from);
    conditions.push(`"createdAt" >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`"createdAt" <= $${values.length}`);
  }
  if (filters.firmId) {
    values.push(filters.firmId);
    conditions.push(`"firmId" = $${values.length}`);
  }
  if (filters.documentId) {
    values.push(filters.documentId);
    conditions.push(`"documentId" = $${values.length}`);
  }
  if (filters.caseId) {
    values.push(filters.caseId);
    conditions.push(`"caseId" = $${values.length}`);
  }
  if (filters.jobType) {
    values.push(filters.jobType);
    conditions.push(`"jobType" = $${values.length}`);
  }

  return {
    whereSql: conditions.join(" and "),
    values,
  };
}

async function queryAggregateRows(filters: DeferredJobTelemetryFilters, includeJobType: boolean): Promise<AggregateRow[]> {
  const { whereSql, values } = buildWhereSql(filters);
  const selectJobType = includeJobType ? `"jobType" as "jobType",` : `'all' as "jobType",`;
  const groupBySql = includeJobType ? `group by "jobType"` : "";
  const orderBySql = includeJobType ? `order by "avgWaitMs" desc, "p95RunMs" desc, "jobType" asc` : "";

  const { rows } = await pgPool.query(
    `
    select
      ${selectJobType}
      count(*)::int as "attempts",
      count(*) filter (where success = true)::int as "successCount",
      count(*) filter (where success = false)::int as "failureCount",
      count(*) filter (where attempt > 1)::int as "retriedCount",
      coalesce(avg("waitMs"), 0)::float8 as "avgWaitMs",
      coalesce(percentile_cont(0.95) within group (order by "waitMs"), 0)::float8 as "p95WaitMs",
      coalesce(max("waitMs"), 0)::int as "oldestWaitMs",
      coalesce(avg("runMs"), 0)::float8 as "avgRunMs",
      coalesce(percentile_cont(0.95) within group (order by "runMs"), 0)::float8 as "p95RunMs",
      coalesce(avg(attempt), 0)::float8 as "avgAttempt",
      coalesce(max(attempt), 0)::int as "maxAttempt",
      to_char(max("finishedAt"), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as "lastFinishedAt"
    from "DeferredJobTelemetry"
    where ${whereSql}
    ${groupBySql}
    ${orderBySql}
    `,
    values
  );

  return rows.map((row) => normalizeAggregateRow(row));
}

export async function recordDeferredJobAttempt(input: DeferredJobTelemetryInput): Promise<void> {
  const startedAt = coerceDate(input.startedAt);
  const finishedAt = coerceDate(input.finishedAt, startedAt);
  const queuedAt = coerceDate(input.queuedAt, startedAt);

  await safeCreateTelemetry({
    firmId: normalizeNullableString(input.firmId),
    documentId: normalizeNullableString(input.documentId),
    caseId: normalizeNullableString(input.caseId),
    jobType: input.jobType,
    action: normalizeNullableString(input.action),
    dedupeKey: normalizeNullableString(input.dedupeKey),
    workerLabel: normalizeNullableString(input.workerLabel),
    queuedAt,
    startedAt,
    finishedAt,
    waitMs: diffMs(queuedAt, startedAt),
    runMs: diffMs(startedAt, finishedAt),
    attempt: normalizeAttempt(input.attempt),
    success: input.outcome === "success",
    errorMessage: sanitizeErrorMessage(input.errorMessage),
    meta: input.meta ?? Prisma.JsonNull,
  });
}

export async function getDeferredJobTelemetryOverview(
  filters: DeferredJobTelemetryFilters
): Promise<DeferredJobTelemetryOverview> {
  const [summaryRows, byType] = await Promise.all([
    queryAggregateRows(filters, false),
    queryAggregateRows(filters, true),
  ]);

  const summaryRow = summaryRows[0] ?? ({ jobType: "ocr", ...zeroSummary(), lastFinishedAt: null } as DeferredJobTimingByType);

  return {
    window: {
      from: filters.from?.toISOString() ?? null,
      to: filters.to?.toISOString() ?? null,
    },
    summary: {
      attempts: summaryRow.attempts,
      successCount: summaryRow.successCount,
      failureCount: summaryRow.failureCount,
      retriedCount: summaryRow.retriedCount,
      avgWaitMs: summaryRow.avgWaitMs,
      p95WaitMs: summaryRow.p95WaitMs,
      oldestWaitMs: summaryRow.oldestWaitMs,
      avgRunMs: summaryRow.avgRunMs,
      p95RunMs: summaryRow.p95RunMs,
      avgAttempt: summaryRow.avgAttempt,
      maxAttempt: summaryRow.maxAttempt,
    },
    byType,
  };
}
