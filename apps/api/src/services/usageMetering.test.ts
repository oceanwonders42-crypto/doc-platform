import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

import { prisma } from "../db/prisma";
import { getMonthlyDemandUsage, recordGeneratedDemandOutput } from "./usageMetering";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const firmId = `demand-usage-firm-${suffix}`;
  const caseId = `demand-usage-case-${suffix}`;
  const existingAprilPackageId = `demand-usage-april-${suffix}`;
  const draftPackageId = `demand-usage-draft-${suffix}`;
  const previousMonthPackageId = `demand-usage-march-${suffix}`;
  const docOnlyPackageId = `demand-usage-doc-only-${suffix}`;
  const dateOnlyPackageId = `demand-usage-date-only-${suffix}`;

  const aprilGeneratedAt = new Date("2026-04-20T15:30:00.000Z");
  const aprilExistingGeneratedAt = new Date("2026-04-05T09:00:00.000Z");
  const marchGeneratedAt = new Date("2026-03-31T23:30:00.000Z");
  const mayProbeAt = new Date("2026-05-02T11:00:00.000Z");
  const mayRegeneratedAt = new Date("2026-05-15T10:00:00.000Z");

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Demand usage proof firm",
      },
    });
    await prisma.legalCase.create({
      data: {
        id: caseId,
        firmId,
        title: "Demand usage proof case",
        status: "open",
      },
    });
    await prisma.demandPackage.createMany({
      data: [
        {
          id: existingAprilPackageId,
          firmId,
          caseId,
          title: "Existing saved demand package",
          status: "ready",
          generatedDocId: `doc-existing-${suffix}`,
          generatedAt: aprilExistingGeneratedAt,
        },
        {
          id: draftPackageId,
          firmId,
          caseId,
          title: "Draft demand package",
          status: "draft",
        },
        {
          id: previousMonthPackageId,
          firmId,
          caseId,
          title: "Previous month demand package",
          status: "ready",
          generatedDocId: `doc-march-${suffix}`,
          generatedAt: marchGeneratedAt,
        },
        {
          id: docOnlyPackageId,
          firmId,
          caseId,
          title: "Doc only package",
          status: "ready",
          generatedDocId: `doc-only-${suffix}`,
        },
        {
          id: dateOnlyPackageId,
          firmId,
          caseId,
          title: "Date only package",
          status: "ready",
          generatedAt: mayProbeAt,
        },
      ],
    });

    const aprilBefore = await getMonthlyDemandUsage(firmId, aprilGeneratedAt);
    assert.equal(aprilBefore.yearMonth, "2026-04");
    assert.equal(
      aprilBefore.demandCount,
      1,
      "Only saved/generated demand packages with both generatedDocId and generatedAt should count."
    );

    const marchUsage = await getMonthlyDemandUsage(firmId, marchGeneratedAt);
    assert.equal(marchUsage.yearMonth, "2026-03");
    assert.equal(
      marchUsage.demandCount,
      1,
      "Previous-month saved output should remain scoped to its own month."
    );

    const mayUsage = await getMonthlyDemandUsage(firmId, mayProbeAt);
    assert.equal(
      mayUsage.demandCount,
      0,
      "Preview/probe rows without both generatedDocId and generatedAt must never count as true demands."
    );

    const recorded = await recordGeneratedDemandOutput({
      demandPackageId: draftPackageId,
      firmId,
      generatedDocId: `doc-new-${suffix}`,
      generatedAt: aprilGeneratedAt,
      status: "ready",
    });
    assert.equal(recorded.demandPackage.id, draftPackageId);
    assert.equal(recorded.demandPackage.status, "ready");
    assert.equal(recorded.demandPackage.generatedDocId, `doc-new-${suffix}`);
    assert.equal(
      recorded.demandPackage.generatedAt?.toISOString(),
      aprilGeneratedAt.toISOString()
    );
    assert.equal(recorded.usage.yearMonth, "2026-04");
    assert.equal(
      recorded.usage.demandCount,
      2,
      "Recording one saved demand output should increase the clean monthly count by one."
    );

    const reRecorded = await recordGeneratedDemandOutput({
      demandPackageId: draftPackageId,
      firmId,
      generatedDocId: `doc-regenerated-${suffix}`,
      generatedAt: mayRegeneratedAt,
      status: "ready",
    });
    assert.equal(
      reRecorded.demandPackage.generatedAt?.toISOString(),
      aprilGeneratedAt.toISOString(),
      "Regenerating the same demand package must preserve the first successful saved-output month."
    );
    assert.equal(
      reRecorded.usage.demandCount,
      2,
      "Regenerating the same demand package must not create duplicate monthly demand counts."
    );

    const aprilAfter = await getMonthlyDemandUsage(firmId, aprilGeneratedAt);
    assert.equal(
      aprilAfter.demandCount,
      2,
      "The original month should retain the same clean demand count after regeneration."
    );

    const mayAfter = await getMonthlyDemandUsage(firmId, mayRegeneratedAt);
    assert.equal(
      mayAfter.demandCount,
      0,
      "Later regenerations of an already-counted demand package must not create a new monthly demand."
    );

    console.log("usage metering tests passed", {
      firmId,
      aprilDemandCount: aprilAfter.demandCount,
      marchDemandCount: marchUsage.demandCount,
      mayDemandCount: mayAfter.demandCount,
    });
  } finally {
    await prisma.demandPackage.deleteMany({
      where: {
        id: {
          in: [
            existingAprilPackageId,
            draftPackageId,
            previousMonthPackageId,
            docOnlyPackageId,
            dateOnlyPackageId,
          ],
        },
      },
    });
    await prisma.legalCase.deleteMany({
      where: { id: caseId },
    });
    await prisma.firm.deleteMany({
      where: { id: firmId },
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
