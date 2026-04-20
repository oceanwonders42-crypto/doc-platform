import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

import { prisma } from "../db/prisma";
import { buildWeeklyOperatorReport } from "./operatorWeeklyReport";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date("2026-04-19T12:00:00.000Z");
  const firmA = `weekly-report-firm-a-${suffix}`;
  const firmB = `weekly-report-firm-b-${suffix}`;
  const docA = `weekly-report-doc-a-${suffix}`;
  const docB = `weekly-report-doc-b-${suffix}`;
  const docC = `weekly-report-doc-c-${suffix}`;

  const currentCreatedAt = new Date("2026-04-18T12:00:00.000Z");
  const previousCreatedAt = new Date("2026-04-10T12:00:00.000Z");

  try {
    await prisma.aiTaskTelemetry.createMany({
      data: [
        {
          id: `weekly-ai-1-${suffix}`,
          firmId: firmA,
          documentId: docA,
          taskType: "explain",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-explain-v1",
          promptTokens: 140,
          completionTokens: 50,
          totalTokens: 190,
          estimatedCostUsd: 0.000051,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-ai-2-${suffix}`,
          firmId: firmA,
          documentId: docB,
          taskType: "summary",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-summary-v1",
          promptTokens: 100,
          completionTokens: 30,
          totalTokens: 130,
          estimatedCostUsd: 0.000033,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-ai-3-${suffix}`,
          firmId: firmA,
          documentId: docB,
          taskType: "summary",
          kind: "cache_hit",
          model: "gpt-4o-mini",
          promptVersion: "document-summary-v1",
          promptTokens: 100,
          completionTokens: 30,
          totalTokens: 130,
          estimatedCostUsd: 0.000033,
          cacheUsed: true,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-ai-4-${suffix}`,
          firmId: firmA,
          documentId: docB,
          taskType: "extraction",
          kind: "dedupe_avoided",
          dedupeAvoided: true,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-ai-5-${suffix}`,
          firmId: firmB,
          documentId: docC,
          taskType: "insurance_extraction",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "insurance-offer-extractor-v1",
          promptTokens: 80,
          completionTokens: 20,
          totalTokens: 100,
          estimatedCostUsd: 0.000024,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-ai-6-${suffix}`,
          firmId: firmA,
          documentId: docA,
          taskType: "summary",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-summary-v1",
          promptTokens: 60,
          completionTokens: 20,
          totalTokens: 80,
          estimatedCostUsd: 0.000018,
          createdAt: previousCreatedAt,
        },
      ],
    });

    await prisma.deferredJobTelemetry.createMany({
      data: [
        {
          id: `weekly-job-1-${suffix}`,
          firmId: firmA,
          documentId: docA,
          jobType: "ocr",
          queuedAt: new Date("2026-04-18T11:59:58.000Z"),
          startedAt: new Date("2026-04-18T12:00:00.000Z"),
          finishedAt: new Date("2026-04-18T12:00:01.100Z"),
          waitMs: 2000,
          runMs: 1100,
          attempt: 1,
          success: true,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-job-2-${suffix}`,
          firmId: firmA,
          caseId: `weekly-case-${suffix}`,
          jobType: "post_route_sync",
          action: "approved",
          queuedAt: new Date("2026-04-18T12:00:00.000Z"),
          startedAt: new Date("2026-04-18T12:00:00.200Z"),
          finishedAt: new Date("2026-04-18T12:00:00.220Z"),
          waitMs: 200,
          runMs: 20,
          attempt: 1,
          success: true,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-job-3-${suffix}`,
          firmId: firmA,
          caseId: `weekly-case-${suffix}`,
          jobType: "timeline_rebuild",
          queuedAt: new Date("2026-04-18T12:00:00.000Z"),
          startedAt: new Date("2026-04-18T12:00:00.300Z"),
          finishedAt: new Date("2026-04-18T12:00:00.420Z"),
          waitMs: 300,
          runMs: 120,
          attempt: 2,
          success: true,
          createdAt: currentCreatedAt,
        },
        {
          id: `weekly-job-4-${suffix}`,
          firmId: firmA,
          documentId: docA,
          jobType: "ocr",
          queuedAt: new Date("2026-04-10T11:59:59.700Z"),
          startedAt: new Date("2026-04-10T12:00:00.000Z"),
          finishedAt: new Date("2026-04-10T12:00:00.400Z"),
          waitMs: 300,
          runMs: 400,
          attempt: 1,
          success: true,
          createdAt: previousCreatedAt,
        },
      ],
    });

    const report = await buildWeeklyOperatorReport({
      scope: "global",
      days: 7,
      now,
      queueSnapshot: {
        available: true,
        queueDepth: 1,
        oldestJobAgeMs: 500,
        retriedQueuedCount: 0,
        byType: {
          ocr: { queued: 1, oldestAgeMs: 500, retriedQueuedCount: 0, maxAttempt: 1 },
          classification: { queued: 0, oldestAgeMs: null, retriedQueuedCount: 0, maxAttempt: 0 },
          extraction: { queued: 0, oldestAgeMs: null, retriedQueuedCount: 0, maxAttempt: 0 },
          case_match: { queued: 0, oldestAgeMs: null, retriedQueuedCount: 0, maxAttempt: 0 },
          timeline_rebuild: { queued: 0, oldestAgeMs: null, retriedQueuedCount: 0, maxAttempt: 0 },
          post_route_sync: { queued: 0, oldestAgeMs: null, retriedQueuedCount: 0, maxAttempt: 0 },
        },
        dedupeMarkers: {
          timeline_rebuild: { queued: 0, running: 0, rerunRequested: 0 },
          post_route_sync: { queued: 0, running: 0, rerunRequested: 0 },
          case_match: { queued: 0, running: 0, rerunRequested: 0 },
          extraction: { queued: 0, running: 0, rerunRequested: 0 },
        },
      },
    });

    assert.equal(report.kind, "weekly_operator_report");
    assert.equal(report.scope, "global");
    assert.equal(report.queue.snapshot.queueDepth, 1);
    assert.equal(report.cost.summary.executedCount, 3);
    assert.equal(report.savings.cacheSavedCount, 1);
    assert.equal(report.savings.dedupeAvoidedCount, 1);
    assert.equal(report.cost.topDocuments[0]?.id, docA);
    assert.equal(report.cost.topFirms[0]?.id, firmA);
    assert.equal(report.cost.byTask[0]?.taskType, "explain");
    assert.equal(report.queue.ocr.current?.queuedNow, 1);
    assert.equal(report.queue.ocr.current?.avgWaitMs, 2000);
    assert(report.anomalies.some((entry) => entry.code === "ocr_wait_regression"));
    assert(report.anomalies.some((entry) => entry.code === "ocr_runtime_regression"));

    console.log("operator weekly report tests passed", {
      topDocument: report.cost.topDocuments[0],
      topFirm: report.cost.topFirms[0],
      anomalies: report.anomalies.map((entry) => entry.code),
    });
  } finally {
    await prisma.aiTaskTelemetry.deleteMany({
      where: {
        id: {
          in: [
            `weekly-ai-1-${suffix}`,
            `weekly-ai-2-${suffix}`,
            `weekly-ai-3-${suffix}`,
            `weekly-ai-4-${suffix}`,
            `weekly-ai-5-${suffix}`,
            `weekly-ai-6-${suffix}`,
          ],
        },
      },
    });
    await prisma.deferredJobTelemetry.deleteMany({
      where: {
        id: {
          in: [
            `weekly-job-1-${suffix}`,
            `weekly-job-2-${suffix}`,
            `weekly-job-3-${suffix}`,
            `weekly-job-4-${suffix}`,
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
