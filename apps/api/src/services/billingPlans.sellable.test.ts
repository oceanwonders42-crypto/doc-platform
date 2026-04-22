import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

import { prisma } from "../db/prisma";
import {
  canIngestDocument,
  getBillingPeriodRange,
  getDocumentIngestPolicy,
  getFirmBillingUsageSnapshot,
  getPlanMetadata,
  isOverDocumentLimit,
} from "./billingPlans";

function assertClose(actual: number, expected: number, label: string) {
  assert(Math.abs(actual - expected) < 0.000001, `${label}: expected ${expected}, got ${actual}`);
}

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const billingCustomerId = `billing-customer-${suffix}`;
  const firmId = `billing-firm-a-${suffix}`;
  const siblingFirmId = `billing-firm-b-${suffix}`;
  const aiTelemetryIds = [
    `billing-ai-1-${suffix}`,
    `billing-ai-2-${suffix}`,
  ];
  const { yearMonth } = getBillingPeriodRange();
  const essentialPlan = getPlanMetadata("essential");
  const growthPlan = getPlanMetadata("growth");

  try {
    await prisma.firm.createMany({
      data: [
        {
          id: firmId,
          name: "Sellable billing proof firm",
          plan: essentialPlan.slug,
          pageLimitMonthly: essentialPlan.docLimitMonthly,
          billingStatus: "active",
          billingCustomerId,
        },
        {
          id: siblingFirmId,
          name: "Sibling billing proof firm",
          plan: growthPlan.slug,
          pageLimitMonthly: growthPlan.docLimitMonthly,
          billingStatus: "active",
          billingCustomerId,
        },
      ],
    });

    await prisma.usageMonthly.create({
      data: {
        firmId,
        yearMonth,
        docsProcessed: 1601,
        pagesProcessed: 1601,
        insuranceDocsExtracted: 3,
        courtDocsExtracted: 1,
        narrativeGenerated: 2,
        duplicateDetected: 4,
      },
    });

    await prisma.aiTaskTelemetry.createMany({
      data: [
        {
          id: aiTelemetryIds[0],
          firmId,
          taskType: "summary",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-summary-v1",
          totalTokens: 100,
          estimatedCostUsd: 20,
        },
        {
          id: aiTelemetryIds[1],
          firmId,
          taskType: "explain",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-explain-v1",
          totalTokens: 150,
          estimatedCostUsd: 15,
        },
      ],
    });

    const snapshot = await getFirmBillingUsageSnapshot(firmId);
    assert(snapshot, "Expected billing usage snapshot for active firm");
    assert.equal(snapshot!.firm.plan, "essential");
    assert.equal(snapshot!.plan.documentLimitMonthly, essentialPlan.docLimitMonthly);
    assert.equal(snapshot!.usage.docsProcessed, 1601);
    assert.equal(snapshot!.usage.aiExecutedCostUsd, 35);
    assert.equal(snapshot!.usage.currentFirmCount, 2);

    assert.equal(snapshot!.enforcement.documents.status, "over_limit");
    assert.equal(snapshot!.enforcement.documents.softCapReached, true);
    assert.equal(snapshot!.enforcement.documents.overageUnits, 101);
    assertClose(snapshot!.enforcement.documents.overageDollars, 20.2, "document overage");

    assert.equal(snapshot!.enforcement.ai.status, "over_limit");
    assert.equal(snapshot!.enforcement.ai.softCapReached, true);
    assertClose(snapshot!.enforcement.ai.overageUnits, 10, "ai overage units");
    assertClose(snapshot!.enforcement.ai.overageDollars, 12, "ai overage");

    assert.equal(snapshot!.enforcement.firms.status, "over_limit");
    assert.equal(snapshot!.enforcement.firms.softCapReached, true);
    assert.equal(snapshot!.enforcement.firms.overageUnits, 1);
    assertClose(snapshot!.enforcement.firms.overageDollars, 499, "firm overage");

    assert.equal(snapshot!.enforcement.overageActive, true);
    assert.equal(snapshot!.enforcement.softCapReached, true);
    assertClose(snapshot!.enforcement.totalOverageDollars, 531.2, "total overage");
    assert.equal(
      isOverDocumentLimit(snapshot!),
      true,
      "Snapshot should report document-limit overage through the policy helper"
    );

    const directPolicyCheck = getDocumentIngestPolicy({
      billingStatus: "active",
      trialEndsAt: null,
      currentDocs: snapshot!.usage.docsProcessed,
      limit: snapshot!.plan.documentLimitMonthly,
      meter: snapshot!.enforcement.documents,
    });
    assert.equal(
      directPolicyCheck.allowed,
      false,
      "Over-limit document usage should now be denied by the policy layer"
    );
    if (!directPolicyCheck.allowed) {
      assert.equal(directPolicyCheck.error, "Monthly document limit reached for current billing period.");
    }

    const ingestCheck = await canIngestDocument(firmId);
    assert.equal(
      ingestCheck.allowed,
      false,
      "Over-limit firm should now be denied by real document-limit policy"
    );
    if (!ingestCheck.allowed) {
      assert.equal(ingestCheck.status, "over_limit");
      assert.equal(ingestCheck.softCapReached, true);
      assert.equal(ingestCheck.overageDocs, 101);
      assertClose(ingestCheck.overageDollars, 20.2, "ingest overage dollars");
      assert.equal(ingestCheck.error, "Monthly document limit reached for current billing period.");
    }

    console.log("billingPlans.sellable.test.ts passed", {
      firmId,
      documentOverage: snapshot!.enforcement.documents.overageDollars,
      aiOverage: snapshot!.enforcement.ai.overageDollars,
      firmOverage: snapshot!.enforcement.firms.overageDollars,
      totalOverage: snapshot!.enforcement.totalOverageDollars,
    });
  } finally {
    await prisma.aiTaskTelemetry.deleteMany({
      where: { id: { in: aiTelemetryIds } },
    });
    await prisma.usageMonthly.deleteMany({
      where: { firmId: { in: [firmId, siblingFirmId] } },
    });
    await prisma.firm.deleteMany({
      where: { id: { in: [firmId, siblingFirmId] } },
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
