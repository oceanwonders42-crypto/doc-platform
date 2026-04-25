import "dotenv/config";

import assert from "node:assert/strict";
import { Role } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { signToken } from "../../lib/jwt";
import { redis } from "../../services/queue";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `connect-email-firm-${suffix}`;
  const userId = `connect-email-user-${suffix}`;
  const userEmail = `connect-email-${suffix}@example.com`;
  const mailboxEmail = `mailbox-${suffix}@example.com`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Connect email route test firm",
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      firmId,
      email: userEmail,
      role: Role.FIRM_ADMIN,
    },
  });

  const token = signToken({
    userId,
    firmId,
    role: Role.FIRM_ADMIN,
    email: userEmail,
  });

  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;
    if (!server.listening) {
      await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
    }

    const response = await fetch(`${started.baseUrl}/integrations/connect-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "GMAIL",
        emailAddress: mailboxEmail,
      }),
      signal: AbortSignal.timeout(10000),
    });

    assert.equal(response.status, 400);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      nextStep?: string;
    };
    assert.equal(json.ok, false);
    assert.match(json.error ?? "", /browser sign-in/i);
    assert.equal(json.nextStep, "/dashboard/integrations/setup?flow=email");

    const [integrations, mailboxes] = await Promise.all([
      prisma.firmIntegration.findMany({ where: { firmId, type: "EMAIL" } }),
      prisma.mailboxConnection.findMany({ where: { firmId, emailAddress: mailboxEmail } }),
    ]);

    assert.equal(integrations.length, 0);
    assert.equal(mailboxes.length, 0);

    console.log("integrations.connectEmailRoute.test.ts passed");
  } finally {
    if (server) {
      await stopTestServer(server);
    }
    await prisma.integrationSyncLog.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.mailboxConnection.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.integrationCredential.deleteMany({
      where: {
        integration: {
          firmId,
        },
      },
    }).catch(() => undefined);
    await prisma.firmIntegration.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end(), redis.quit()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(process.exitCode ?? 0);
  });
