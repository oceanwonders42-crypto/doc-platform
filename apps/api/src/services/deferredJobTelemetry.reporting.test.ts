import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

import { prisma } from "../db/prisma";
import { getDeferredJobTelemetryOverview, recordDeferredJobAttempt } from "./deferredJobTelemetry";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const firmId = `deferred-telemetry-firm-${suffix}`;
  const documentId = `deferred-telemetry-doc-${suffix}`;
  const caseId = `deferred-telemetry-case-${suffix}`;
  const windowStart = new Date(Date.now() - 60_000);

  try {
    const base = Date.now();

    await recordDeferredJobAttempt({
      firmId,
      documentId,
      caseId,
      jobType: "extraction",
      queuedAt: new Date(base - 10),
      startedAt: new Date(base),
      finishedAt: new Date(base + 200),
      attempt: 2,
      outcome: "failed",
      errorMessage: "synthetic extraction failure",
    });

    await recordDeferredJobAttempt({
      firmId,
      caseId,
      jobType: "timeline_rebuild",
      queuedAt: new Date(base - 5),
      startedAt: new Date(base),
      finishedAt: new Date(base + 10),
      attempt: 1,
      outcome: "success",
    });

    await recordDeferredJobAttempt({
      firmId,
      documentId,
      caseId,
      jobType: "post_route_sync",
      action: "approved",
      queuedAt: new Date(base - 2),
      startedAt: new Date(base),
      finishedAt: new Date(base + 10),
      attempt: 1,
      outcome: "success",
    });

    const overview = await getDeferredJobTelemetryOverview({
      firmId,
      from: windowStart,
      to: new Date(Date.now() + 60_000),
    });

    assert.equal(overview.summary.attempts, 3);
    assert.equal(overview.summary.successCount, 2);
    assert.equal(overview.summary.failureCount, 1);
    assert.equal(overview.summary.retriedCount, 1);
    assert.equal(overview.summary.avgWaitMs, 5.67);
    assert.equal(overview.summary.p95WaitMs, 9.5);
    assert.equal(overview.summary.oldestWaitMs, 10);
    assert.equal(overview.summary.avgRunMs, 73.33);
    assert.equal(overview.summary.p95RunMs, 181);
    assert.equal(overview.summary.avgAttempt, 1.33);
    assert.equal(overview.summary.maxAttempt, 2);

    const extraction = overview.byType.find((entry) => entry.jobType === "extraction");
    assert(extraction);
    assert.equal(extraction.failureCount, 1);
    assert.equal(extraction.successCount, 0);
    assert.equal(extraction.retriedCount, 1);
    assert.equal(extraction.avgWaitMs, 10);
    assert.equal(extraction.p95RunMs, 200);

    const timeline = overview.byType.find((entry) => entry.jobType === "timeline_rebuild");
    assert(timeline);
    assert.equal(timeline.successCount, 1);
    assert.equal(timeline.avgWaitMs, 5);
    assert.equal(timeline.avgRunMs, 10);

    const postRoute = overview.byType.find((entry) => entry.jobType === "post_route_sync");
    assert(postRoute);
    assert.equal(postRoute.successCount, 1);
    assert.equal(postRoute.avgWaitMs, 2);
    assert.equal(postRoute.avgRunMs, 10);

    console.log("deferred job telemetry reporting tests passed", {
      summary: overview.summary,
      byType: overview.byType.map((entry) => ({
        jobType: entry.jobType,
        avgWaitMs: entry.avgWaitMs,
        p95RunMs: entry.p95RunMs,
        failureCount: entry.failureCount,
      })),
    });
  } finally {
    await prisma.deferredJobTelemetry.deleteMany({
      where: { firmId },
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
