import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";
process.env.PLATFORM_ADMIN_API_KEY = process.env.PLATFORM_ADMIN_API_KEY ?? `platform-admin-${crypto.randomBytes(8).toString("hex")}`;

import { Role } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const entitlementFirmId = `admin-clio-entitlement-${suffix}`;
  const legacyFirmId = `admin-clio-legacy-${suffix}`;
  const disabledFirmId = `admin-clio-disabled-${suffix}`;
  const firmAdminUserId = `admin-clio-firm-admin-${suffix}`;

  let server: import("node:http").Server | null = null;

  try {
    await prisma.firm.createMany({
      data: [
        {
          id: entitlementFirmId,
          name: "Clio entitlement firm",
          plan: "growth",
          features: [],
        },
        {
          id: legacyFirmId,
          name: "Clio legacy fallback firm",
          plan: "essential",
          features: ["crm_sync"],
        },
        {
          id: disabledFirmId,
          name: "Clio disabled firm",
          plan: "essential",
          features: [],
        },
      ],
    });

    await prisma.user.create({
      data: {
        id: firmAdminUserId,
        firmId: entitlementFirmId,
        email: `admin-clio-firm-admin-${suffix}@example.com`,
        role: Role.FIRM_ADMIN,
      },
    });

    const firmAdminToken = signToken({
      userId: firmAdminUserId,
      firmId: entitlementFirmId,
      role: Role.FIRM_ADMIN,
      email: `admin-clio-firm-admin-${suffix}@example.com`,
    });

    const started = await startTestServer(app);
    server = started.server;

    const adminResponse = await fetch(`${started.baseUrl}/admin/firms`, {
      headers: {
        Authorization: `Bearer ${process.env.PLATFORM_ADMIN_API_KEY}`,
      },
    });
    assert.equal(adminResponse.status, 200, `Expected platform admin /admin/firms 200, got ${adminResponse.status}`);
    const adminPayload = await adminResponse.json() as {
      ok?: boolean;
      firms?: Array<{
        firmId: string;
        firmName: string;
        planSlug: string;
        plan: string;
        clioAutoUpdateEntitled: boolean;
        legacyClioSyncEnabled: boolean;
        clioAutoUpdateGateSource: "entitlement" | "legacy_flag" | null;
        features?: unknown;
      }>;
    };
    assert.equal(adminPayload.ok, true);

    const firmsById = new Map((adminPayload.firms ?? []).map((firm) => [firm.firmId, firm]));
    const entitlementFirm = firmsById.get(entitlementFirmId);
    const legacyFirm = firmsById.get(legacyFirmId);
    const disabledFirm = firmsById.get(disabledFirmId);

    assert.ok(entitlementFirm, "Expected entitlement firm to be present in /admin/firms response.");
    assert.equal(entitlementFirm?.planSlug, "growth");
    assert.equal(entitlementFirm?.clioAutoUpdateEntitled, true);
    assert.equal(entitlementFirm?.legacyClioSyncEnabled, false);
    assert.equal(entitlementFirm?.clioAutoUpdateGateSource, "entitlement");

    assert.ok(legacyFirm, "Expected legacy fallback firm to be present in /admin/firms response.");
    assert.equal(legacyFirm?.planSlug, "essential");
    assert.equal(legacyFirm?.clioAutoUpdateEntitled, false);
    assert.equal(legacyFirm?.legacyClioSyncEnabled, true);
    assert.equal(legacyFirm?.clioAutoUpdateGateSource, "legacy_flag");

    assert.ok(disabledFirm, "Expected disabled firm to be present in /admin/firms response.");
    assert.equal(disabledFirm?.planSlug, "essential");
    assert.equal(disabledFirm?.clioAutoUpdateEntitled, false);
    assert.equal(disabledFirm?.legacyClioSyncEnabled, false);
    assert.equal(disabledFirm?.clioAutoUpdateGateSource, null);

    assert.equal("features" in (entitlementFirm ?? {}), false, "Expected /admin/firms to avoid leaking raw feature arrays.");

    const firmAdminResponse = await fetch(`${started.baseUrl}/admin/firms`, {
      headers: {
        Authorization: `Bearer ${firmAdminToken}`,
      },
    });
    assert.equal(firmAdminResponse.status, 403, `Expected firm admin /admin/firms 403, got ${firmAdminResponse.status}`);

    console.log("adminFirmsClioGateRoute.test.ts passed");
  } finally {
    if (server) {
      await stopTestServer(server);
    }
    await prisma.user.deleteMany({
      where: { id: firmAdminUserId },
    });
    await prisma.firm.deleteMany({
      where: { id: { in: [entitlementFirmId, legacyFirmId, disabledFirmId] } },
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
