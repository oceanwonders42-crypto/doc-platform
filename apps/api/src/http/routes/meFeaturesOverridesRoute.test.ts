import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";
process.env.EMAIL_AUTOMATION_ENABLED = "true";

import { Role } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import {
  startTestServer,
  stopTestServer,
} from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const firmId = `me-features-override-${suffix}`;
  const userId = `me-features-user-${suffix}`;

  let server: import("node:http").Server | null = null;

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Me features override firm",
        plan: "essential",
        features: [],
      },
    });

    await prisma.user.create({
      data: {
        id: userId,
        firmId,
        email: `me-features-user-${suffix}@example.com`,
        role: Role.STAFF,
      },
    });

    await prisma.firmFeatureOverride.createMany({
      data: [
        {
          id: `me-features-case-insights-${suffix}`,
          firmId,
          featureKey: "case_insights",
          enabled: true,
          isActive: true,
          startsAt: new Date("2026-04-01T00:00:00.000Z"),
          endsAt: new Date("2026-05-01T00:00:00.000Z"),
          reason: "Temporary summaries pilot",
        },
        {
          id: `me-features-demand-expired-${suffix}`,
          firmId,
          featureKey: "demand_narratives",
          enabled: true,
          isActive: true,
          startsAt: new Date("2026-03-01T00:00:00.000Z"),
          endsAt: new Date("2026-03-31T23:59:59.000Z"),
          reason: "Expired trial",
        },
        {
          id: `me-features-email-${suffix}`,
          firmId,
          featureKey: "email_automation",
          enabled: true,
          isActive: true,
          startsAt: new Date("2026-04-01T00:00:00.000Z"),
          endsAt: new Date("2026-05-01T00:00:00.000Z"),
          reason: "Temporary email automation access",
        },
      ],
    });

    const token = signToken({
      userId,
      firmId,
      role: Role.STAFF,
      email: `me-features-user-${suffix}@example.com`,
    });

    const started = await startTestServer(app);
    server = started.server;

    const response = await fetch(`${started.baseUrl}/me/features`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      case_insights?: boolean;
      demand_narratives?: boolean;
      email_automation?: boolean;
      crm_sync?: boolean;
      crm_push?: boolean;
    };

    assert.equal(payload.case_insights, true);
    assert.equal(payload.demand_narratives, false);
    assert.equal(payload.email_automation, true);
    assert.equal(payload.crm_sync, false);
    assert.equal(payload.crm_push, false);

    console.log("meFeaturesOverridesRoute.test.ts passed");
  } finally {
    if (server) {
      await stopTestServer(server);
    }
    await prisma.firmFeatureOverride.deleteMany({
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
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
