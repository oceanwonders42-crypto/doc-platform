import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

import { prisma } from "../db/prisma";
import {
  getAiCacheHitRates,
  getAiCostLeaderboard,
  getAiCostTimeseries,
  getDocumentAiCostSummary,
  getFirmAiCostSummary,
  OPENAI_TASK_TYPES,
} from "./aiTaskTelemetry";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const firmA = `telemetry-firm-a-${suffix}`;
  const caseA = `telemetry-case-a-${suffix}`;
  const caseB = `telemetry-case-b-${suffix}`;
  const docA = `telemetry-doc-a-${suffix}`;
  const docB = `telemetry-doc-b-${suffix}`;
  const docC = `telemetry-doc-c-${suffix}`;
  const createdAt = new Date();

  try {
    await prisma.aiTaskTelemetry.createMany({
      data: [
        {
          id: `telemetry-row-1-${suffix}`,
          firmId: firmA,
          caseId: caseA,
          documentId: docA,
          taskType: OPENAI_TASK_TYPES.summary,
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-summary-v1",
          promptTokens: 100,
          completionTokens: 30,
          totalTokens: 130,
          estimatedCostUsd: 0.000033,
          createdAt,
        },
        {
          id: `telemetry-row-2-${suffix}`,
          firmId: firmA,
          caseId: caseA,
          documentId: docA,
          taskType: OPENAI_TASK_TYPES.summary,
          kind: "cache_hit",
          model: "gpt-4o-mini",
          promptVersion: "document-summary-v1",
          promptTokens: 100,
          completionTokens: 30,
          totalTokens: 130,
          estimatedCostUsd: 0.000033,
          cacheUsed: true,
          createdAt,
        },
        {
          id: `telemetry-row-3-${suffix}`,
          firmId: firmA,
          caseId: caseA,
          documentId: docA,
          taskType: OPENAI_TASK_TYPES.extractionJob,
          kind: "dedupe_avoided",
          dedupeAvoided: true,
          createdAt,
        },
        {
          id: `telemetry-row-4-${suffix}`,
          firmId: firmA,
          caseId: caseA,
          documentId: docB,
          taskType: OPENAI_TASK_TYPES.insuranceExtraction,
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "insurance-offer-extractor-v1",
          promptTokens: 80,
          completionTokens: 20,
          totalTokens: 100,
          estimatedCostUsd: 0.000024,
          createdAt,
        },
        {
          id: `telemetry-row-5-${suffix}`,
          firmId: firmA,
          caseId: caseB,
          documentId: docC,
          taskType: OPENAI_TASK_TYPES.explain,
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-explain-v1",
          promptTokens: 140,
          completionTokens: 50,
          totalTokens: 190,
          estimatedCostUsd: 0.000051,
          createdAt,
        },
      ],
    });

    const taskLeaderboard = await getAiCostLeaderboard({
      groupBy: "task",
      firmId: firmA,
      limit: 5,
    });
    assert.equal(taskLeaderboard[0]?.id, OPENAI_TASK_TYPES.explain, "highest-cost task should sort first");

    const documentSummary = await getDocumentAiCostSummary(docA);
    assert.equal(documentSummary.totals.executedCount, 1);
    assert.equal(documentSummary.totals.cacheSavedCount, 1);
    assert.equal(documentSummary.totals.dedupeAvoidedCount, 1);

    const firmSummary = await getFirmAiCostSummary(firmA, {
      from: new Date(createdAt.getTime() - 60_000),
      to: new Date(createdAt.getTime() + 60_000),
    });
    assert.equal(firmSummary.totals.executedCount, 3);
    assert.equal(firmSummary.totals.cacheSavedCount, 1);
    assert.equal(firmSummary.totals.dedupeAvoidedCount, 1);

    const cacheRates = await getAiCacheHitRates({
      firmId: firmA,
      from: new Date(createdAt.getTime() - 60_000),
      to: new Date(createdAt.getTime() + 60_000),
    });
    const summaryRate = cacheRates.find((entry) => entry.taskType === OPENAI_TASK_TYPES.summary);
    assert(summaryRate);
    assert.equal(summaryRate.cacheHitRate, 0.5);

    const daily = await getAiCostTimeseries({
      bucket: "day",
      firmId: firmA,
    });
    assert(daily.some((entry) => entry.taskType === OPENAI_TASK_TYPES.summary));
    assert(daily.some((entry) => entry.taskType === OPENAI_TASK_TYPES.explain));

    console.log("ai task telemetry reporting tests passed", {
      topTasks: taskLeaderboard.slice(0, 3).map((entry) => ({
        id: entry.id,
        executedCostUsd: entry.executedCostUsd,
        cacheSavedCostUsd: entry.cacheSavedCostUsd,
      })),
      documentTotals: documentSummary.totals,
      firmTotals: firmSummary.totals,
    });
  } finally {
    await prisma.aiTaskTelemetry.deleteMany({
      where: {
        id: {
          in: [
            `telemetry-row-1-${suffix}`,
            `telemetry-row-2-${suffix}`,
            `telemetry-row-3-${suffix}`,
            `telemetry-row-4-${suffix}`,
            `telemetry-row-5-${suffix}`,
          ],
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
