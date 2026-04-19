import crypto from "crypto";

import type { Prisma } from "@prisma/client";

import { computeNormalizedTextHash } from "./duplicateDetection";
import { logInfo } from "../lib/logger";

export const DOCUMENT_RECOGNITION_TASKS = {
  recognition: "recognition",
  summary: "summary",
  insurance: "insurance_extraction",
  court: "court_extraction",
  risks: "risks",
  insights: "insights",
  explain: "explain",
} as const;

export const DOCUMENT_RECOGNITION_PROMPTS = {
  recognition: { promptVersion: "recognition-rules-v1", model: "local-rules-v1" },
  summary: { promptVersion: "document-summary-v1", model: "gpt-4o-mini" },
  insurance: { promptVersion: "insurance-offer-extractor-v1", model: "gpt-4o-mini" },
  court: { promptVersion: "court-extractor-v1", model: "gpt-4o-mini" },
  risks: { promptVersion: "risk-rules-v1", model: "rule-engine-v1" },
  insights: { promptVersion: "document-insights-rules-v1", model: "rule-engine-v1" },
  explain: { promptVersion: "document-explain-v1", model: "gpt-4o-mini" },
} as const;

type JsonRecord = Record<string, unknown>;

export type TaskCacheEntry<T = unknown> = {
  textHash: string;
  promptVersion: string;
  model: string;
  generatedAt: string;
  output?: T;
};

export type TaskCacheMissReason =
  | "missing_cache"
  | "text_hash_mismatch"
  | "prompt_version_mismatch"
  | "model_mismatch";

export type TaskCacheResponseMeta = {
  cacheUsed: boolean;
  recomputeReason: TaskCacheMissReason | null;
  generatedAt: string | null;
  cacheKey: {
    taskType: string;
    variant?: string;
    promptVersion: string;
    model: string;
  };
};

export type TaskCacheLogContext = {
  source: string;
  documentId?: string;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function getTaskCacheRoot(extractedJson: unknown): JsonRecord {
  if (!isJsonRecord(extractedJson)) return {};
  const taskCache = extractedJson.taskCache;
  return isJsonRecord(taskCache) ? taskCache : {};
}

function parseTaskCacheKey(taskKey: string): { taskType: string; variant: string | null } {
  const [taskType, ...rest] = taskKey.split(":");
  return {
    taskType,
    variant: rest.length > 0 ? rest.join(":") : null,
  };
}

export function buildTaskCacheKey(taskType: string, variant?: string): string {
  return variant ? `${taskType}:${variant}` : taskType;
}

export function computeDocumentExplainVariant(question: string): string {
  return crypto.createHash("sha256").update(question.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function getStoredTextHash(text: string | null | undefined): string {
  return computeNormalizedTextHash(text);
}

export function getTaskCacheEntry<T = unknown>(extractedJson: unknown, taskKey: string): TaskCacheEntry<T> | null {
  const value = getTaskCacheRoot(extractedJson)[taskKey];
  if (!isJsonRecord(value)) return null;
  if (
    typeof value.textHash !== "string" ||
    typeof value.promptVersion !== "string" ||
    typeof value.model !== "string" ||
    typeof value.generatedAt !== "string"
  ) {
    return null;
  }

  return value as TaskCacheEntry<T>;
}

export function inspectTaskCache<T = unknown>(
  extractedJson: unknown,
  taskKey: string,
  expected: { textHash: string; promptVersion: string; model: string }
): {
  cacheUsed: boolean;
  recomputeReason: TaskCacheMissReason | null;
  entry: TaskCacheEntry<T> | null;
  meta: TaskCacheResponseMeta;
} {
  const entry = getTaskCacheEntry<T>(extractedJson, taskKey);
  const { taskType, variant } = parseTaskCacheKey(taskKey);
  let recomputeReason: TaskCacheMissReason | null = null;

  if (!entry) recomputeReason = "missing_cache";
  else if (entry.textHash !== expected.textHash) recomputeReason = "text_hash_mismatch";
  else if (entry.promptVersion !== expected.promptVersion) recomputeReason = "prompt_version_mismatch";
  else if (entry.model !== expected.model) recomputeReason = "model_mismatch";

  return {
    cacheUsed: recomputeReason === null,
    recomputeReason,
    entry,
    meta: {
      cacheUsed: recomputeReason === null,
      recomputeReason,
      generatedAt: entry?.generatedAt ?? null,
      cacheKey: {
        taskType,
        ...(variant ? { variant } : {}),
        promptVersion: expected.promptVersion,
        model: expected.model,
      },
    },
  };
}

export function isTaskCacheValid(
  extractedJson: unknown,
  taskKey: string,
  expected: { textHash: string; promptVersion: string; model: string }
): boolean {
  return inspectTaskCache(extractedJson, taskKey, expected).cacheUsed;
}

export function getTaskCacheResponseMeta(
  extractedJson: unknown,
  taskKey: string,
  expected: { textHash: string; promptVersion: string; model: string }
): TaskCacheResponseMeta {
  return inspectTaskCache(extractedJson, taskKey, expected).meta;
}

export function upsertTaskCacheEntry<T>(
  extractedJson: unknown,
  taskKey: string,
  entry: TaskCacheEntry<T>
): Prisma.InputJsonValue {
  const root = isJsonRecord(extractedJson) ? { ...extractedJson } : {};
  const taskCache = { ...getTaskCacheRoot(extractedJson), [taskKey]: entry };
  return {
    ...root,
    taskCache,
  } as Prisma.InputJsonValue;
}

export function getTaskCacheStats(extractedJson: unknown): {
  taskCachePresent: boolean;
  taskCount: number;
  taskKeys: string[];
} {
  const root = getTaskCacheRoot(extractedJson);
  const taskKeys = Object.keys(root);
  return {
    taskCachePresent: taskKeys.length > 0,
    taskCount: taskKeys.length,
    taskKeys,
  };
}

export function invalidateTaskCacheEntries(
  extractedJson: unknown,
  taskType?: string | null
): {
  extractedJson: Prisma.InputJsonValue;
  removedKeys: string[];
  remainingKeys: string[];
} {
  const root = isJsonRecord(extractedJson) ? { ...extractedJson } : {};
  const taskCache = { ...getTaskCacheRoot(extractedJson) };
  const allKeys = Object.keys(taskCache);
  const removedKeys =
    taskType && taskType.trim()
      ? allKeys.filter((key) => key === taskType || key.startsWith(`${taskType}:`))
      : allKeys;

  for (const key of removedKeys) {
    delete taskCache[key];
  }

  if (Object.keys(taskCache).length === 0) {
    delete root.taskCache;
  } else {
    root.taskCache = taskCache;
  }

  return {
    extractedJson: root as Prisma.InputJsonValue,
    removedKeys,
    remainingKeys: Object.keys(taskCache),
  };
}

export function logTaskCacheDecision(
  context: TaskCacheLogContext,
  meta: TaskCacheResponseMeta
): void {
  logInfo("document_recognition_cache", {
    source: context.source,
    documentId: context.documentId ?? null,
    taskType: meta.cacheKey.taskType,
    variant: meta.cacheKey.variant ?? null,
    cacheUsed: meta.cacheUsed,
    recomputeReason: meta.recomputeReason,
    promptVersion: meta.cacheKey.promptVersion,
    model: meta.cacheKey.model,
    generatedAt: meta.generatedAt,
  });
}

export async function resolveTaskCache<T>(params: {
  extractedJson: unknown;
  taskKey: string;
  textHash: string;
  promptVersion: string;
  model: string;
  existingValue: T;
  compute: () => Promise<T> | T;
  persistOutput?: boolean;
  logContext?: TaskCacheLogContext;
}): Promise<{
  value: T;
  reused: boolean;
  extractedJson: Prisma.InputJsonValue;
  meta: TaskCacheResponseMeta;
}> {
  const cacheState = inspectTaskCache<T>(params.extractedJson, params.taskKey, {
    textHash: params.textHash,
    promptVersion: params.promptVersion,
    model: params.model,
  });
  const cacheValid = cacheState.cacheUsed;

  if (cacheValid) {
    if (params.logContext) {
      logTaskCacheDecision(params.logContext, cacheState.meta);
    }

    if (params.persistOutput) {
      return {
        value: (cacheState.entry?.output ?? params.existingValue) as T,
        reused: true,
        extractedJson: (params.extractedJson ?? {}) as Prisma.InputJsonValue,
        meta: cacheState.meta,
      };
    }

    return {
      value: params.existingValue,
      reused: true,
      extractedJson: (params.extractedJson ?? {}) as Prisma.InputJsonValue,
      meta: cacheState.meta,
    };
  }

  const value = await params.compute();
  const nextEntry: TaskCacheEntry<T> = {
    textHash: params.textHash,
    promptVersion: params.promptVersion,
    model: params.model,
    generatedAt: new Date().toISOString(),
    ...(params.persistOutput ? { output: value } : {}),
  };
  const extractedJson = upsertTaskCacheEntry(params.extractedJson, params.taskKey, nextEntry);
  const meta = {
    ...cacheState.meta,
    cacheUsed: false,
    generatedAt: nextEntry.generatedAt,
  } satisfies TaskCacheResponseMeta;

  if (params.logContext) {
    logTaskCacheDecision(params.logContext, meta);
  }

  return {
    value,
    reused: false,
    extractedJson,
    meta,
  };
}
