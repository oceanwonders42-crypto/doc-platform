import crypto from "crypto";
import { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { logWarn } from "../lib/logger";

export const OPENAI_TASK_TYPES = {
  summary: "summary",
  insuranceExtraction: "insurance_extraction",
  courtExtraction: "court_extraction",
  explain: "explain",
  narrativeGeneration: "narrative_generation",
  recordsRequestLetter: "records_request_letter",
  extractionJob: "extraction",
  caseMatchJob: "case_match",
} as const;

type AiTaskType = (typeof OPENAI_TASK_TYPES)[keyof typeof OPENAI_TASK_TYPES];

type PricingEntry = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

// Verified against OpenAI pricing on 2026-04-19:
// https://platform.openai.com/docs/pricing/ -> gpt-4o-mini input $0.15 / 1M, output $0.60 / 1M.
const OPENAI_MODEL_PRICING: Record<string, PricingEntry> = {
  "gpt-4o-mini": {
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.60,
  },
};

type AiTaskTelemetryBase = {
  firmId?: string | null;
  documentId?: string | null;
  caseId?: string | null;
  taskType: string;
  taskVariant?: string | null;
  source?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  inputHash?: string | null;
  meta?: Prisma.InputJsonValue | null;
};

type ExecutedTelemetryInput = AiTaskTelemetryBase & {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
  cacheUsed?: boolean;
  dedupeAvoided?: boolean;
};

type FailedTelemetryInput = AiTaskTelemetryBase & {
  errorMessage: string;
};

type CacheHitTelemetryInput = AiTaskTelemetryBase;

type DedupeTelemetryInput = AiTaskTelemetryBase & {
  taskType: (typeof OPENAI_TASK_TYPES)["extractionJob"] | (typeof OPENAI_TASK_TYPES)["caseMatchJob"];
};

type AggregateFilters = {
  from?: Date | null;
  to?: Date | null;
  taskType?: string | null;
  documentId?: string | null;
  caseId?: string | null;
  firmId?: string | null;
};

export type CostLeaderboardGroupBy = "task" | "document" | "case" | "firm";
export type CostTimeseriesBucket = "day" | "week";

type TelemetryKind = "executed" | "cache_hit" | "dedupe_avoided" | "failed";

type AggregateRow = {
  taskType: string;
  kind: TelemetryKind;
  count: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type CostTotals = {
  executedCount: number;
  executedCostUsd: number;
  cacheSavedCount: number;
  cacheSavedCostUsd: number;
  dedupeAvoidedCount: number;
  failedCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiCostTaskBreakdown = CostTotals & {
  taskType: string;
};

export type AiCostEntitySummary = {
  totals: CostTotals;
  byTask: AiCostTaskBreakdown[];
};

export type AiCostLeaderboardEntry = CostTotals & {
  id: string;
  label: string;
  groupBy: CostLeaderboardGroupBy;
  lastSeenAt: string | null;
};

export type AiCostTimeseriesPoint = {
  bucketStart: string;
  taskType: string;
  executedCostUsd: number;
  cacheSavedCostUsd: number;
  dedupeAvoidedCount: number;
  executedCount: number;
  cacheSavedCount: number;
};

export type AiCacheHitRateEntry = {
  taskType: string;
  executedCount: number;
  cacheHitCount: number;
  cacheHitRate: number;
};

function sanitizeErrorMessage(errorMessage: string): string {
  return errorMessage.trim().slice(0, 4000);
}

function normalizeNullableString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundUsd(value: number | null | undefined): number {
  return Number(((value ?? 0) as number).toFixed(8));
}

function zeroTotals(): CostTotals {
  return {
    executedCount: 0,
    executedCostUsd: 0,
    cacheSavedCount: 0,
    cacheSavedCostUsd: 0,
    dedupeAvoidedCount: 0,
    failedCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

function kindCountKey(kind: TelemetryKind): keyof CostTotals {
  switch (kind) {
    case "executed":
      return "executedCount";
    case "cache_hit":
      return "cacheSavedCount";
    case "dedupe_avoided":
      return "dedupeAvoidedCount";
    case "failed":
      return "failedCount";
  }
}

function mergeAggregateRow(target: CostTotals, row: AggregateRow): void {
  target[kindCountKey(row.kind)] += row.count;

  if (row.kind === "executed") {
    target.executedCostUsd = roundUsd(target.executedCostUsd + row.estimatedCostUsd);
    target.promptTokens += row.promptTokens;
    target.completionTokens += row.completionTokens;
    target.totalTokens += row.totalTokens;
    return;
  }

  if (row.kind === "cache_hit") {
    target.cacheSavedCostUsd = roundUsd(target.cacheSavedCostUsd + row.estimatedCostUsd);
  }
}

function summarizeAggregateRows(rows: AggregateRow[]): AiCostEntitySummary {
  const totals = zeroTotals();
  const byTask = new Map<string, CostTotals>();

  for (const row of rows) {
    mergeAggregateRow(totals, row);

    const existing = byTask.get(row.taskType) ?? zeroTotals();
    mergeAggregateRow(existing, row);
    byTask.set(row.taskType, existing);
  }

  return {
    totals,
    byTask: Array.from(byTask.entries())
      .map(([taskType, metrics]) => ({ taskType, ...metrics }))
      .sort((left, right) => {
        if (right.executedCostUsd !== left.executedCostUsd) return right.executedCostUsd - left.executedCostUsd;
        if (right.cacheSavedCostUsd !== left.cacheSavedCostUsd) return right.cacheSavedCostUsd - left.cacheSavedCostUsd;
        return right.dedupeAvoidedCount - left.dedupeAvoidedCount;
      }),
  };
}

export function computeAiInputHash(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function estimateOpenAiCostUsd(
  model: string | null | undefined,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined
): number | null {
  const pricing = model ? OPENAI_MODEL_PRICING[model] : null;
  if (!pricing) {
    return null;
  }

  const inputTokens = normalizeNullableNumber(promptTokens);
  const outputTokens = normalizeNullableNumber(completionTokens);
  const inputCost = inputTokens == null ? 0 : (inputTokens / 1_000_000) * pricing.inputPerMillionUsd;
  const outputCost = outputTokens == null ? 0 : (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Number((inputCost + outputCost).toFixed(8));
}

async function safeCreateTelemetry(data: Prisma.AiTaskTelemetryCreateInput): Promise<void> {
  try {
    await prisma.aiTaskTelemetry.create({ data });
  } catch (error) {
    logWarn("ai_task_telemetry_write_failed", {
      taskType: data.taskType,
      kind: data.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildTelemetryCreateInput(
  kind: string,
  input: AiTaskTelemetryBase & {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    estimatedCostUsd?: number | null;
    cacheUsed?: boolean;
    dedupeAvoided?: boolean;
    errorMessage?: string | null;
  }
): Prisma.AiTaskTelemetryCreateInput {
  return {
    kind: kind as Prisma.AiTaskTelemetryCreateInput["kind"],
    firmId: normalizeNullableString(input.firmId),
    documentId: normalizeNullableString(input.documentId),
    caseId: normalizeNullableString(input.caseId),
    taskType: input.taskType,
    taskVariant: normalizeNullableString(input.taskVariant),
    source: normalizeNullableString(input.source),
    model: normalizeNullableString(input.model),
    promptVersion: normalizeNullableString(input.promptVersion),
    inputHash: normalizeNullableString(input.inputHash),
    promptTokens: normalizeNullableNumber(input.promptTokens),
    completionTokens: normalizeNullableNumber(input.completionTokens),
    totalTokens: normalizeNullableNumber(input.totalTokens),
    estimatedCostUsd: normalizeNullableNumber(input.estimatedCostUsd),
    cacheUsed: input.cacheUsed ?? false,
    dedupeAvoided: input.dedupeAvoided ?? false,
    errorMessage: input.errorMessage ? sanitizeErrorMessage(input.errorMessage) : null,
    meta: input.meta ?? Prisma.JsonNull,
  };
}

export async function recordAiTaskExecuted(input: ExecutedTelemetryInput): Promise<void> {
  await safeCreateTelemetry(buildTelemetryCreateInput("executed", input));
}

export async function recordAiTaskFailed(input: FailedTelemetryInput): Promise<void> {
  await safeCreateTelemetry(
    buildTelemetryCreateInput("failed", {
      ...input,
      cacheUsed: false,
      dedupeAvoided: false,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
    })
  );
}

async function findLatestExecutedFingerprint(
  input: Pick<CacheHitTelemetryInput, "documentId" | "caseId" | "taskType" | "taskVariant" | "model" | "promptVersion" | "inputHash">
) {
  return prisma.aiTaskTelemetry.findFirst({
    where: {
      kind: "executed",
      documentId: normalizeNullableString(input.documentId),
      caseId: normalizeNullableString(input.caseId),
      taskType: input.taskType,
      taskVariant: normalizeNullableString(input.taskVariant),
      model: normalizeNullableString(input.model),
      promptVersion: normalizeNullableString(input.promptVersion),
      inputHash: normalizeNullableString(input.inputHash),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function recordAiTaskCacheHit(input: CacheHitTelemetryInput): Promise<void> {
  const reference = await findLatestExecutedFingerprint(input);
  await safeCreateTelemetry(
    buildTelemetryCreateInput("cache_hit", {
      ...input,
      promptTokens: reference?.promptTokens ?? null,
      completionTokens: reference?.completionTokens ?? null,
      totalTokens: reference?.totalTokens ?? null,
      estimatedCostUsd: reference?.estimatedCostUsd ?? null,
      cacheUsed: true,
      dedupeAvoided: false,
      meta: {
        reusedFromTelemetryId: reference?.id ?? null,
        ...(input.meta && typeof input.meta === "object" ? input.meta : {}),
      } as Prisma.InputJsonValue,
    })
  );
}

export async function recordAiTaskDedupeAvoided(input: DedupeTelemetryInput): Promise<void> {
  await safeCreateTelemetry(
    buildTelemetryCreateInput("dedupe_avoided", {
      ...input,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
      cacheUsed: false,
      dedupeAvoided: true,
    })
  );
}

export async function runOpenAiChatCompletionWithTelemetry(params: {
  openai: OpenAI;
  request: ChatCompletionCreateParamsNonStreaming;
  telemetry: AiTaskTelemetryBase;
}): Promise<ChatCompletion> {
  try {
    const completion = await params.openai.chat.completions.create(params.request);
    const promptTokens = completion.usage?.prompt_tokens ?? null;
    const completionTokens = completion.usage?.completion_tokens ?? null;
    const totalTokens = completion.usage?.total_tokens ?? null;
    const model = completion.model ?? params.telemetry.model ?? params.request.model;
    const estimatedCostUsd = estimateOpenAiCostUsd(model, promptTokens, completionTokens);

    await recordAiTaskExecuted({
      ...params.telemetry,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      cacheUsed: false,
      dedupeAvoided: false,
    });

    return completion;
  } catch (error) {
    await recordAiTaskFailed({
      ...params.telemetry,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getDocumentAiTelemetryReport(documentId: string) {
  const rows = await prisma.aiTaskTelemetry.groupBy({
    by: ["taskType", "kind"],
    where: { documentId },
    _sum: {
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      estimatedCostUsd: true,
    },
    _count: { _all: true },
  });

  return rows.map((row) => ({
    taskType: row.taskType,
    kind: row.kind as TelemetryKind,
    count: row._count._all,
    promptTokens: row._sum.promptTokens ?? 0,
    completionTokens: row._sum.completionTokens ?? 0,
    totalTokens: row._sum.totalTokens ?? 0,
    estimatedCostUsd: roundUsd(row._sum.estimatedCostUsd ?? 0),
  })) satisfies AggregateRow[];
}

export async function getAiTelemetryAggregate(filters: AggregateFilters) {
  const where: Prisma.AiTaskTelemetryWhereInput = {
    ...(filters.taskType ? { taskType: filters.taskType } : {}),
    ...(filters.documentId ? { documentId: filters.documentId } : {}),
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...(filters.firmId ? { firmId: filters.firmId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.aiTaskTelemetry.groupBy({
    by: ["taskType", "kind"],
    where,
    _sum: {
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      estimatedCostUsd: true,
    },
    _count: { _all: true },
  });

  return rows.map((row) => ({
    taskType: row.taskType,
    kind: row.kind as TelemetryKind,
    count: row._count._all,
    promptTokens: row._sum.promptTokens ?? 0,
    completionTokens: row._sum.completionTokens ?? 0,
    totalTokens: row._sum.totalTokens ?? 0,
    estimatedCostUsd: roundUsd(row._sum.estimatedCostUsd ?? 0),
  })) satisfies AggregateRow[];
}

export async function getAiCostSummary(filters: AggregateFilters): Promise<AiCostEntitySummary> {
  const rows = await getAiTelemetryAggregate(filters);
  return summarizeAggregateRows(rows);
}

export async function getDocumentAiCostSummary(documentId: string): Promise<AiCostEntitySummary> {
  return getAiCostSummary({ documentId });
}

export async function getFirmAiCostSummary(
  firmId: string,
  filters: Omit<AggregateFilters, "firmId"> = {}
): Promise<AiCostEntitySummary> {
  return getAiCostSummary({ ...filters, firmId });
}

export async function getCaseAiCostSummary(
  caseId: string,
  filters: Omit<AggregateFilters, "caseId"> = {}
): Promise<AiCostEntitySummary> {
  return getAiCostSummary({ ...filters, caseId });
}

export async function getAiCacheHitRates(filters: AggregateFilters): Promise<AiCacheHitRateEntry[]> {
  const summary = await getAiCostSummary(filters);
  return summary.byTask
    .map((row) => {
      const denominator = row.executedCount + row.cacheSavedCount;
      return {
        taskType: row.taskType,
        executedCount: row.executedCount,
        cacheHitCount: row.cacheSavedCount,
        cacheHitRate: denominator > 0 ? Number((row.cacheSavedCount / denominator).toFixed(4)) : 0,
      };
    })
    .sort((left, right) => right.cacheHitRate - left.cacheHitRate || right.cacheHitCount - left.cacheHitCount);
}

export async function getAiCostTimeseries(params: {
  bucket: CostTimeseriesBucket;
  from?: Date | null;
  to?: Date | null;
  firmId?: string | null;
}): Promise<AiCostTimeseriesPoint[]> {
  const bucketSql = params.bucket === "week" ? "week" : "day";
  const conditions = [`1 = 1`];
  const values: unknown[] = [];

  if (params.from) {
    values.push(params.from);
    conditions.push(`"createdAt" >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    conditions.push(`"createdAt" <= $${values.length}`);
  }
  if (params.firmId) {
    values.push(params.firmId);
    conditions.push(`"firmId" = $${values.length}`);
  }

  const { rows } = await pgPool.query(
    `
    select
      to_char(date_trunc('${bucketSql}', "createdAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "bucketStart",
      "taskType" as "taskType",
      coalesce(sum("estimatedCostUsd") filter (where "kind" = 'executed'), 0)::float8 as "executedCostUsd",
      coalesce(sum("estimatedCostUsd") filter (where "kind" = 'cache_hit'), 0)::float8 as "cacheSavedCostUsd",
      count(*) filter (where "kind" = 'dedupe_avoided')::int as "dedupeAvoidedCount",
      count(*) filter (where "kind" = 'executed')::int as "executedCount",
      count(*) filter (where "kind" = 'cache_hit')::int as "cacheSavedCount"
    from "AiTaskTelemetry"
    where ${conditions.join(" and ")}
    group by 1, 2
    order by 1 desc, 3 desc, 4 desc
    `,
    values
  );

  return rows.map((row) => ({
    bucketStart: row.bucketStart,
    taskType: row.taskType,
    executedCostUsd: roundUsd(row.executedCostUsd),
    cacheSavedCostUsd: roundUsd(row.cacheSavedCostUsd),
    dedupeAvoidedCount: Number(row.dedupeAvoidedCount ?? 0),
    executedCount: Number(row.executedCount ?? 0),
    cacheSavedCount: Number(row.cacheSavedCount ?? 0),
  }));
}

export async function getAiCostLeaderboard(params: {
  groupBy: CostLeaderboardGroupBy;
  from?: Date | null;
  to?: Date | null;
  firmId?: string | null;
  limit?: number | null;
}): Promise<AiCostLeaderboardEntry[]> {
  const groupConfig = {
    task: {
      idSql: `"taskType"`,
      labelSql: `"taskType"`,
      joinSql: "",
      groupBySql: `"taskType"`,
      whereSql: `"taskType" is not null`,
    },
    document: {
      idSql: `t."documentId"`,
      labelSql: `coalesce(d."originalName", t."documentId")`,
      joinSql: `left join "Document" d on d.id = t."documentId"`,
      groupBySql: `t."documentId", d."originalName"`,
      whereSql: `t."documentId" is not null`,
    },
    case: {
      idSql: `t."caseId"`,
      labelSql: `coalesce(c.title, c."caseNumber", t."caseId")`,
      joinSql: `left join "Case" c on c.id = t."caseId"`,
      groupBySql: `t."caseId", c.title, c."caseNumber"`,
      whereSql: `t."caseId" is not null`,
    },
    firm: {
      idSql: `t."firmId"`,
      labelSql: `coalesce(f.name, t."firmId")`,
      joinSql: `left join "Firm" f on f.id = t."firmId"`,
      groupBySql: `t."firmId", f.name`,
      whereSql: `t."firmId" is not null`,
    },
  } satisfies Record<CostLeaderboardGroupBy, {
    idSql: string;
    labelSql: string;
    joinSql: string;
    groupBySql: string;
    whereSql: string;
  }>;

  const config = groupConfig[params.groupBy];
  const conditions = [config.whereSql];
  const values: unknown[] = [];

  if (params.from) {
    values.push(params.from);
    conditions.push(`t."createdAt" >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    conditions.push(`t."createdAt" <= $${values.length}`);
  }
  if (params.firmId) {
    values.push(params.firmId);
    conditions.push(`t."firmId" = $${values.length}`);
  }

  const limit = Math.max(1, Math.min(params.limit ?? 10, 50));
  values.push(limit);

  const { rows } = await pgPool.query(
    `
    select
      ${config.idSql} as id,
      ${config.labelSql} as label,
      count(*) filter (where t."kind" = 'executed')::int as "executedCount",
      coalesce(sum(t."estimatedCostUsd") filter (where t."kind" = 'executed'), 0)::float8 as "executedCostUsd",
      count(*) filter (where t."kind" = 'cache_hit')::int as "cacheSavedCount",
      coalesce(sum(t."estimatedCostUsd") filter (where t."kind" = 'cache_hit'), 0)::float8 as "cacheSavedCostUsd",
      count(*) filter (where t."kind" = 'dedupe_avoided')::int as "dedupeAvoidedCount",
      count(*) filter (where t."kind" = 'failed')::int as "failedCount",
      coalesce(sum(t."promptTokens") filter (where t."kind" = 'executed'), 0)::int as "promptTokens",
      coalesce(sum(t."completionTokens") filter (where t."kind" = 'executed'), 0)::int as "completionTokens",
      coalesce(sum(t."totalTokens") filter (where t."kind" = 'executed'), 0)::int as "totalTokens",
      max(t."createdAt") as "lastSeenAt"
    from "AiTaskTelemetry" t
    ${config.joinSql}
    where ${conditions.join(" and ")}
    group by ${config.groupBySql}
    order by "executedCostUsd" desc, "cacheSavedCostUsd" desc, "dedupeAvoidedCount" desc, "lastSeenAt" desc
    limit $${values.length}
    `,
    values
  );

  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label ?? row.id),
    groupBy: params.groupBy,
    executedCount: Number(row.executedCount ?? 0),
    executedCostUsd: roundUsd(row.executedCostUsd),
    cacheSavedCount: Number(row.cacheSavedCount ?? 0),
    cacheSavedCostUsd: roundUsd(row.cacheSavedCostUsd),
    dedupeAvoidedCount: Number(row.dedupeAvoidedCount ?? 0),
    failedCount: Number(row.failedCount ?? 0),
    promptTokens: Number(row.promptTokens ?? 0),
    completionTokens: Number(row.completionTokens ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
  }));
}
