import "dotenv/config";

import assert from "node:assert/strict";
import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `team-limit-firm-${suffix}`;
  const adminId = `team-limit-admin-${suffix}`;
  const staffId = `team-limit-staff-${suffix}`;
  const adminEmail = `team-limit-admin-${suffix}@example.com`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Team Invite Limit Test Firm",
      settings: { seatLimit: 2 },
      billingStatus: "active",
    },
  });
  await prisma.user.createMany({
    data: [
      {
        id: adminId,
        firmId,
        email: adminEmail,
        role: Role.FIRM_ADMIN,
        passwordHash: "present",
      },
      {
        id: staffId,
        firmId,
        email: `team-limit-staff-${suffix}@example.com`,
        role: Role.STAFF,
        passwordHash: "present",
      },
    ],
  });

  const adminToken = signToken({
    userId: adminId,
    firmId,
    role: Role.FIRM_ADMIN,
    email: adminEmail,
  });

  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;

    const blockedInvite = await fetch(`${started.baseUrl}/me/team/invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `blocked-assistant-${suffix}@example.com`,
        role: "ASSISTANT",
      }),
    });
    assert.equal(blockedInvite.status, 402);
    const blockedJson = (await blockedInvite.json()) as { error?: string };
    assert.match(blockedJson.error ?? "", /seat/i);

    await prisma.firm.update({
      where: { id: firmId },
      data: { settings: { seatLimit: 3 } },
    });

    const invitedEmail = `invited-attorney-${suffix}@example.com`;
    const inviteResponse = await fetch(`${started.baseUrl}/me/team/invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: invitedEmail,
        role: "ATTORNEY",
      }),
    });
    assert.equal(inviteResponse.status, 200);
    const inviteJson = (await inviteResponse.json()) as {
      ok?: boolean;
      inviteLink?: string;
      user?: { role?: string; status?: string };
    };
    assert.equal(inviteJson.ok, true);
    assert.equal(inviteJson.user?.role, "ATTORNEY");
    assert.equal(inviteJson.user?.status, "PENDING_PASSWORD");
    assert.match(inviteJson.inviteLink ?? "", /team\/invite\/accept/);

    const token = new URL(inviteJson.inviteLink ?? "").searchParams.get("token") ?? "";
    const acceptResponse = await fetch(`${started.baseUrl}/team/invite/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password: "ValidPass2026!",
      }),
    });
    assert.equal(acceptResponse.status, 200);
    const acceptJson = (await acceptResponse.json()) as {
      ok?: boolean;
      user?: { role?: string; status?: string };
      token?: string;
    };
    assert.equal(acceptJson.ok, true);
    assert.equal(acceptJson.user?.role, "ATTORNEY");
    assert.equal(acceptJson.user?.status, "ACTIVE");
    assert.equal(typeof acceptJson.token, "string");

    const deactivateResponse = await fetch(`${started.baseUrl}/me/team/${staffId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deactivateResponse.status, 200);
    const staffToken = signToken({
      userId: staffId,
      firmId,
      role: Role.STAFF,
      email: `team-limit-staff-${suffix}@example.com`,
    });
    const deactivatedAuthResponse = await fetch(`${started.baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(deactivatedAuthResponse.status, 401);

    console.log("teamInvitesLimitRoute.test passed");
  } finally {
    if (server) await stopTestServer(server);
    await prisma.user.deleteMany({ where: { firmId } }).catch(() => {});
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => {});
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
