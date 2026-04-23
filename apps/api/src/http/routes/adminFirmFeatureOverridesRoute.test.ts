import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";
process.env.PLATFORM_ADMIN_API_KEY =
  process.env.PLATFORM_ADMIN_API_KEY ??
  `platform-admin-${crypto.randomBytes(8).toString("hex")}`;

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
  const firmId = `firm-feature-override-${suffix}`;
  const firmAdminUserId = `firm-feature-admin-${suffix}`;
  const now = Date.now();
  const activeStartsAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const activeEndsAt = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
  const overlappingStartsAt = new Date(
    now + 2 * 24 * 60 * 60 * 1000
  ).toISOString();
  const overlappingEndsAt = new Date(
    now + 20 * 24 * 60 * 60 * 1000
  ).toISOString();
  const futureStartsAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  const futureEndsAt = new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString();

  let server: import("node:http").Server | null = null;

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Feature override firm",
        plan: "essential",
        features: ["crm_sync"],
      },
    });

    await prisma.user.create({
      data: {
        id: firmAdminUserId,
        firmId,
        email: `firm-feature-admin-${suffix}@example.com`,
        role: Role.FIRM_ADMIN,
      },
    });

    const firmAdminToken = signToken({
      userId: firmAdminUserId,
      firmId,
      role: Role.FIRM_ADMIN,
      email: `firm-feature-admin-${suffix}@example.com`,
    });

    const started = await startTestServer(app);
    server = started.server;

    const createResponse = await fetch(
      `${started.baseUrl}/admin/firms/${firmId}/feature-overrides`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          featureKey: "case_insights",
          enabled: true,
          startsAt: activeStartsAt,
          endsAt: activeEndsAt,
          reason: "Pilot access",
        }),
      }
    );
    assert.equal(createResponse.status, 200);
    const createdPayload = (await createResponse.json()) as {
      ok?: boolean;
      override?: { id?: string; featureKey?: string; enabled?: boolean };
      effectiveFeature?: {
        featureKey?: string;
        effectiveEnabled?: boolean;
        source?: string;
      };
    };
    assert.equal(createdPayload.ok, true);
    assert.equal(createdPayload.override?.featureKey, "case_insights");
    assert.equal(createdPayload.override?.enabled, true);
    assert.equal(createdPayload.effectiveFeature?.featureKey, "case_insights");
    assert.equal(createdPayload.effectiveFeature?.effectiveEnabled, true);
    assert.equal(createdPayload.effectiveFeature?.source, "override");

    const detailResponse = await fetch(`${started.baseUrl}/admin/firms/${firmId}`, {
      headers: {
        Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
      },
    });
    assert.equal(detailResponse.status, 200);
    const detailPayload = (await detailResponse.json()) as {
      ok?: boolean;
      featureKeys?: string[];
      effectiveFeatureAccess?: Array<{
        featureKey: string;
        effectiveEnabled: boolean;
        source: "plan" | "override" | "none" | "entitlement" | "legacy_flag";
        planEnabled?: boolean;
        activeNow: boolean;
      }>;
      featureOverrides?: Array<{
        id: string;
        featureKey: string;
        enabled: boolean;
        isActive: boolean;
        reason: string | null;
      }>;
      features?: unknown;
    };
    assert.equal(detailPayload.ok, true);
    assert.ok(detailPayload.featureKeys?.includes("case_insights"));
    assert.equal("features" in detailPayload, false);

    const caseInsightsEntry = detailPayload.effectiveFeatureAccess?.find(
      (entry) => entry.featureKey === "case_insights"
    );
    assert.equal(caseInsightsEntry?.effectiveEnabled, true);
    assert.equal(caseInsightsEntry?.source, "override");
    assert.equal(caseInsightsEntry?.activeNow, true);

    const crmSyncEntry = detailPayload.effectiveFeatureAccess?.find(
      (entry) => entry.featureKey === "crm_sync"
    );
    assert.equal(crmSyncEntry?.effectiveEnabled, true);
    assert.equal(crmSyncEntry?.source, "legacy_flag");
    assert.equal(crmSyncEntry?.planEnabled, false);

    const createdOverride = detailPayload.featureOverrides?.find(
      (override) => override.featureKey === "case_insights"
    );
    assert.ok(createdOverride);
    assert.equal(createdOverride?.enabled, true);
    assert.equal(createdOverride?.isActive, true);
    assert.equal(createdOverride?.reason, "Pilot access");

    const overlappingCreateResponse = await fetch(
      `${started.baseUrl}/admin/firms/${firmId}/feature-overrides`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          featureKey: "case_insights",
          enabled: false,
          startsAt: overlappingStartsAt,
          endsAt: overlappingEndsAt,
          reason: "Conflicting disable window",
        }),
      }
    );
    assert.equal(overlappingCreateResponse.status, 400);
    const overlappingCreatePayload =
      (await overlappingCreateResponse.json()) as {
        error?: string;
      };
    assert.equal(
      overlappingCreatePayload.error,
      "An overlapping active override already exists for this feature."
    );

    const futureCreateResponse = await fetch(
      `${started.baseUrl}/admin/firms/${firmId}/feature-overrides`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          featureKey: "case_insights",
          enabled: false,
          startsAt: futureStartsAt,
          endsAt: futureEndsAt,
          reason: "Future disable window",
        }),
      }
    );
    assert.equal(futureCreateResponse.status, 200);
    const futureCreatePayload = (await futureCreateResponse.json()) as {
      override?: { id?: string; featureKey?: string };
    };
    assert.equal(futureCreatePayload.override?.featureKey, "case_insights");
    const futureOverrideId = futureCreatePayload.override?.id;
    assert.ok(futureOverrideId);

    const overlappingPatchResponse = await fetch(
      `${started.baseUrl}/admin/firms/${firmId}/feature-overrides/${futureOverrideId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          startsAt: overlappingStartsAt,
          endsAt: overlappingEndsAt,
        }),
      }
    );
    assert.equal(overlappingPatchResponse.status, 400);
    const overlappingPatchPayload =
      (await overlappingPatchResponse.json()) as {
        error?: string;
      };
    assert.equal(
      overlappingPatchPayload.error,
      "An overlapping active override already exists for this feature."
    );

    const patchResponse = await fetch(
      `${started.baseUrl}/admin/firms/${firmId}/feature-overrides/${createdOverride?.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          isActive: false,
        }),
      }
    );
    assert.equal(patchResponse.status, 200);

    const updatedDetailResponse = await fetch(
      `${started.baseUrl}/admin/firms/${firmId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
        },
      }
    );
    assert.equal(updatedDetailResponse.status, 200);
    const updatedDetailPayload = (await updatedDetailResponse.json()) as {
      effectiveFeatureAccess?: Array<{
        featureKey: string;
        effectiveEnabled: boolean;
        source: "plan" | "override" | "none" | "entitlement" | "legacy_flag";
        activeNow: boolean;
      }>;
    };
    const disabledCaseInsightsEntry =
      updatedDetailPayload.effectiveFeatureAccess?.find(
        (entry) => entry.featureKey === "case_insights"
      );
    assert.equal(disabledCaseInsightsEntry?.effectiveEnabled, false);
    assert.equal(disabledCaseInsightsEntry?.source, "none");
    assert.equal(disabledCaseInsightsEntry?.activeNow, false);

    const deniedResponse = await fetch(
      `${started.baseUrl}/admin/firms/${firmId}/feature-overrides`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firmAdminToken}`,
        },
        body: JSON.stringify({
          featureKey: "case_insights",
          enabled: true,
        }),
      }
    );
    assert.equal(deniedResponse.status, 403);

    console.log("adminFirmFeatureOverridesRoute.test.ts passed");
  } finally {
    if (server) {
      await stopTestServer(server);
    }
    await prisma.firmFeatureOverride.deleteMany({
      where: { firmId },
    });
    await prisma.user.deleteMany({
      where: { id: firmAdminUserId },
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
