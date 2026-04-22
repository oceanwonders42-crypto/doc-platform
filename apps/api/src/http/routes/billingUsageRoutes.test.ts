import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/15";

const { prisma } = require("../../db/prisma") as typeof import("../../db/prisma");
const { signToken } = require("../../lib/jwt") as typeof import("../../lib/jwt");
const { app } = require("../server") as typeof import("../server");
const { getBillingPeriodRange, getPlanMetadata } = require("../../services/billingPlans") as typeof import("../../services/billingPlans");
const { startTestServer, stopTestServer } = require("./cases.batchClioRouteTestUtils") as typeof import("./cases.batchClioRouteTestUtils");

async function getJson(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const firmId = `billing-routes-firm-${suffix}`;
  const userId = `billing-routes-user-${suffix}`;
  const email = `billing-routes-${suffix}@example.com`;
  const telemetryIds = [
    `billing-routes-ai-1-${suffix}`,
    `billing-routes-ai-2-${suffix}`,
  ];
  const { yearMonth } = getBillingPeriodRange();
  const essentialPlan = getPlanMetadata("essential");
  const token = signToken({
    userId,
    firmId,
    role: "STAFF",
    email,
  });

  let server: import("node:http").Server | null = null;

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Billing routes proof firm",
        plan: essentialPlan.slug,
        pageLimitMonthly: essentialPlan.docLimitMonthly,
        billingStatus: "active",
      },
    });

    await prisma.user.create({
      data: {
        id: userId,
        firmId,
        email,
        role: "STAFF",
      },
    });

    await prisma.usageMonthly.create({
      data: {
        firmId,
        yearMonth,
        docsProcessed: 1502,
        pagesProcessed: 1502,
        insuranceDocsExtracted: 5,
        courtDocsExtracted: 2,
        narrativeGenerated: 3,
        duplicateDetected: 1,
      },
    });

    await prisma.aiTaskTelemetry.createMany({
      data: [
        {
          id: telemetryIds[0],
          firmId,
          taskType: "summary",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-summary-v1",
          totalTokens: 120,
          estimatedCostUsd: 18,
        },
        {
          id: telemetryIds[1],
          firmId,
          taskType: "explain",
          kind: "executed",
          model: "gpt-4o-mini",
          promptVersion: "document-explain-v1",
          totalTokens: 180,
          estimatedCostUsd: 12,
        },
      ],
    });

    const started = await startTestServer(app);
    server = started.server;
    const baseUrl = started.baseUrl;

    const plansResponse = await getJson(`${baseUrl}/billing/plans`, token);
    assert.equal(plansResponse.status, 200, `Expected /billing/plans 200, got ${plansResponse.status}`);
    const plansJson = (await plansResponse.json()) as { ok?: boolean; plans?: Array<{ slug: string }> };
    assert.equal(plansJson.ok, true);
    assert.deepEqual(
      plansJson.plans?.map((plan) => plan.slug),
      ["essential", "growth", "premium"],
      "Expected sellable plans only"
    );

    const usageResponse = await getJson(`${baseUrl}/me/usage?months=1`, token);
    assert.equal(usageResponse.status, 200, `Expected /me/usage 200, got ${usageResponse.status}`);
    const usageJson = (await usageResponse.json()) as {
      ok?: boolean;
      firm?: { plan?: string; documentLimitMonthly?: number };
      plan?: { slug?: string };
      usage?: { docsProcessed?: number; aiExecutedCostUsd?: number };
      enforcement?: {
        documents?: { status?: string; softCapReached?: boolean };
        ai?: { status?: string };
        overageActive?: boolean;
      };
      usageByMonth?: Array<{ yearMonth: string; docsProcessed: number }>;
    };
    assert.equal(usageJson.ok, true);
    assert.equal(usageJson.firm?.plan, "essential");
    assert.equal(usageJson.firm?.documentLimitMonthly, 1500);
    assert.equal(usageJson.plan?.slug, "essential");
    assert.equal(usageJson.usage?.docsProcessed, 1502);
    assert.equal(usageJson.usage?.aiExecutedCostUsd, 30);
    assert.equal(usageJson.enforcement?.documents?.status, "over_limit");
    assert.equal(usageJson.enforcement?.documents?.softCapReached, true);
    assert.equal(usageJson.enforcement?.ai?.status, "over_limit");
    assert.equal(usageJson.enforcement?.overageActive, true);
    assert.equal(usageJson.usageByMonth?.[0]?.yearMonth, yearMonth);
    assert.equal(usageJson.usageByMonth?.[0]?.docsProcessed, 1502);

    const billingStatusResponse = await getJson(`${baseUrl}/billing/status`, token);
    assert.equal(billingStatusResponse.status, 200, `Expected /billing/status 200, got ${billingStatusResponse.status}`);
    const billingStatusJson = (await billingStatusResponse.json()) as {
      ok?: boolean;
      firm?: { id?: string; plan?: string; billingStatus?: string };
      enforcement?: { documents?: { overageUnits?: number } };
    };
    assert.equal(billingStatusJson.ok, true);
    assert.equal(billingStatusJson.firm?.id, firmId);
    assert.equal(billingStatusJson.firm?.plan, "essential");
    assert.equal(billingStatusJson.firm?.billingStatus, "active");
    assert.equal(billingStatusJson.enforcement?.documents?.overageUnits, 2);

    const firmUsageResponse = await getJson(`${baseUrl}/firm/usage`, token);
    assert.equal(firmUsageResponse.status, 200, `Expected /firm/usage 200, got ${firmUsageResponse.status}`);
    const firmUsageJson = (await firmUsageResponse.json()) as {
      ok?: boolean;
      firm?: { id?: string };
      usage?: { docsProcessed?: number };
      enforcement?: { documents?: { status?: string } };
    };
    assert.equal(firmUsageJson.ok, true);
    assert.equal(firmUsageJson.firm?.id, firmId);
    assert.equal(firmUsageJson.usage?.docsProcessed, 1502);
    assert.equal(firmUsageJson.enforcement?.documents?.status, "over_limit");

    console.log("billingUsageRoutes.test.ts passed", {
      firmId,
      plans: plansJson.plans?.map((plan) => plan.slug),
      docsProcessed: usageJson.usage?.docsProcessed,
      documentStatus: usageJson.enforcement?.documents?.status,
      aiStatus: usageJson.enforcement?.ai?.status,
    });
  } finally {
    if (server) {
      await stopTestServer(server);
    }
    await prisma.aiTaskTelemetry.deleteMany({
      where: { id: { in: telemetryIds } },
    });
    await prisma.usageMonthly.deleteMany({
      where: { firmId },
    });
    await prisma.user.deleteMany({
      where: { id: userId },
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
