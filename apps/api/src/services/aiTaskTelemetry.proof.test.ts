import assert from "node:assert/strict";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  getAiTelemetryAggregate,
  getDocumentAiTelemetryReport,
  OPENAI_TASK_TYPES,
  recordAiTaskCacheHit,
  recordAiTaskDedupeAvoided,
  recordAiTaskExecuted,
} from "./aiTaskTelemetry";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL missing");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const seed = Date.now().toString();
  const documentId = `telemetry-proof-doc-${seed}`;
  const caseId = `telemetry-proof-case-${seed}`;
  const firmId = `telemetry-proof-firm-${seed}`;
  const inputHash = `telemetry-proof-hash-${seed}`;
  const createdIds: string[] = [];

  try {
    await recordAiTaskExecuted({
      firmId,
      documentId,
      caseId,
      taskType: OPENAI_TASK_TYPES.summary,
      source: "telemetry-proof",
      model: "gpt-4o-mini",
      promptVersion: "document-summary-v1",
      inputHash,
      promptTokens: 120,
      completionTokens: 40,
      totalTokens: 160,
      estimatedCostUsd: 0.000042,
      meta: { proof: true },
    });

    const executed = await prisma.aiTaskTelemetry.findMany({
      where: { documentId, taskType: OPENAI_TASK_TYPES.summary, kind: "executed" },
      orderBy: { createdAt: "asc" },
    });
    createdIds.push(...executed.map((row) => row.id));
    assert.equal(executed.length, 1, "expected one executed summary telemetry row");

    await recordAiTaskCacheHit({
      firmId,
      documentId,
      caseId,
      taskType: OPENAI_TASK_TYPES.summary,
      source: "telemetry-proof",
      model: "gpt-4o-mini",
      promptVersion: "document-summary-v1",
      inputHash,
      meta: { proof: true },
    });

    const cacheHits = await prisma.aiTaskTelemetry.findMany({
      where: { documentId, taskType: OPENAI_TASK_TYPES.summary, kind: "cache_hit" },
      orderBy: { createdAt: "asc" },
    });
    createdIds.push(...cacheHits.map((row) => row.id));
    assert.equal(cacheHits.length, 1, "expected one cache-hit telemetry row");
    assert.equal(cacheHits[0]?.cacheUsed, true);
    assert.equal(cacheHits[0]?.totalTokens, 160, "cache hit should copy avoided usage profile");

    await recordAiTaskDedupeAvoided({
      firmId,
      documentId,
      caseId,
      taskType: OPENAI_TASK_TYPES.extractionJob,
      source: "telemetry-proof",
      meta: { reason: "queued_duplicate", proof: true },
    });

    const dedupe = await prisma.aiTaskTelemetry.findMany({
      where: { documentId, taskType: OPENAI_TASK_TYPES.extractionJob, kind: "dedupe_avoided" },
      orderBy: { createdAt: "asc" },
    });
    createdIds.push(...dedupe.map((row) => row.id));
    assert.equal(dedupe.length, 1, "expected one dedupe-avoided telemetry row");
    assert.equal(dedupe[0]?.dedupeAvoided, true);

    const documentReport = await getDocumentAiTelemetryReport(documentId);
    const aggregateReport = await getAiTelemetryAggregate({
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
      documentId,
    });

    assert(documentReport.some((row) => row.taskType === OPENAI_TASK_TYPES.summary && row.kind === "executed"));
    assert(documentReport.some((row) => row.taskType === OPENAI_TASK_TYPES.summary && row.kind === "cache_hit"));
    assert(documentReport.some((row) => row.taskType === OPENAI_TASK_TYPES.extractionJob && row.kind === "dedupe_avoided"));
    assert(aggregateReport.length >= 3, "expected aggregate report rows");

    await prisma.$disconnect();

    const prismaAfterRestart = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    try {
      const persistedCount = await prismaAfterRestart.aiTaskTelemetry.count({
        where: { id: { in: createdIds } },
      });
      assert.equal(persistedCount, createdIds.length, "telemetry rows should remain queryable after reconnect");
    } finally {
      await prismaAfterRestart.aiTaskTelemetry.deleteMany({
        where: { id: { in: createdIds } },
      });
      await prismaAfterRestart.$disconnect();
    }

    console.log("ai task telemetry proof tests passed");
  } catch (error) {
    await prisma.aiTaskTelemetry.deleteMany({
      where: { id: { in: createdIds } },
    }).catch(() => undefined);
    await prisma.$disconnect();
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
