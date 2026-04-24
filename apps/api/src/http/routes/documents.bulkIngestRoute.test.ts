import "dotenv/config";

import assert from "node:assert/strict";
import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { signToken } from "../../lib/jwt";
import { redis } from "../../services/queue";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `bulk-ingest-firm-${suffix}`;
  const userId = `bulk-ingest-user-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Bulk ingest route test firm",
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      firmId,
      email: `bulk-ingest-${suffix}@example.com`,
      role: Role.STAFF,
    },
  });

  const token = signToken({
    userId,
    firmId,
    role: Role.STAFF,
    email: `bulk-ingest-${suffix}@example.com`,
  });

  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;

    const unauthenticatedResponse = await fetch(`${started.baseUrl}/me/ingest/bulk`, {
      method: "POST",
    });
    assert.equal(unauthenticatedResponse.status, 401);
    assert.match(
      unauthenticatedResponse.headers.get("content-type") ?? "",
      /application\/json/i
    );
    const unauthenticatedJson = (await unauthenticatedResponse.json()) as {
      ok?: boolean;
      error?: string;
    };
    assert.equal(unauthenticatedJson.ok, false);
    assert.match(unauthenticatedJson.error ?? "", /authorization/i);

    const methodNotAllowedResponse = await fetch(`${started.baseUrl}/me/ingest/bulk`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(methodNotAllowedResponse.status, 405);
    assert.match(
      methodNotAllowedResponse.headers.get("content-type") ?? "",
      /application\/json/i
    );
    const methodNotAllowedJson = (await methodNotAllowedResponse.json()) as {
      ok?: boolean;
      code?: string;
      error?: string;
    };
    assert.equal(methodNotAllowedJson.ok, false);
    assert.equal(methodNotAllowedJson.code, "METHOD_NOT_ALLOWED");
    assert.match(methodNotAllowedJson.error ?? "", /multipart\/form-data/i);

    const aliasResponse = await fetch(`${started.baseUrl}/api/me/ingest/bulk`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: new FormData(),
    });
    assert.equal(aliasResponse.status, 400);
    assert.match(aliasResponse.headers.get("content-type") ?? "", /application\/json/i);
    const aliasJson = (await aliasResponse.json()) as {
      ok?: boolean;
      error?: string;
    };
    assert.equal(aliasJson.ok, false);
    assert.match(aliasJson.error ?? "", /Upload at least one file/i);

    console.log("documents.bulkIngestRoute.test.ts passed");
  } finally {
    if (server) {
      await stopTestServer(server);
    }
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
  });
