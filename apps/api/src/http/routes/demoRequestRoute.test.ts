import "dotenv/config";

import assert from "node:assert/strict";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { redis } from "../../services/queue";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const email = `demo-request-${suffix}@example.com`;
  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;

    const methodResponse = await fetch(`${started.baseUrl}/demo/request`, {
      method: "GET",
    });
    assert.equal(methodResponse.status, 405);
    assert.match(methodResponse.headers.get("content-type") ?? "", /application\/json/i);
    const methodJson = (await methodResponse.json()) as { ok?: boolean; code?: string };
    assert.equal(methodJson.ok, false);
    assert.equal(methodJson.code, "METHOD_NOT_ALLOWED");

    const invalidResponse = await fetch(`${started.baseUrl}/demo/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Q",
        workEmail: "not-an-email",
        firmName: "",
        firmSize: "Huge",
        role: "Wrong",
        improvements: [],
      }),
    });
    assert.equal(invalidResponse.status, 400);
    assert.match(invalidResponse.headers.get("content-type") ?? "", /application\/json/i);
    const invalidJson = (await invalidResponse.json()) as {
      ok?: boolean;
      code?: string;
      fieldErrors?: Record<string, string>;
    };
    assert.equal(invalidJson.ok, false);
    assert.equal(invalidJson.code, "VALIDATION_ERROR");
    assert.ok(invalidJson.fieldErrors?.workEmail);

    const validResponse = await fetch(`${started.baseUrl}/demo/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Synthetic Demo Tester",
        workEmail: email,
        firmName: "Synthetic QA Firm",
        firmSize: "2-5",
        role: "Firm owner/admin",
        improvements: ["Email PDF ingestion", "Demand drafting"],
        message: "SYNTHETIC TEST REQUEST - NOT REAL DATA",
        pageUrl: "https://onyxintels.com/demo",
      }),
    });
    assert.equal(validResponse.status, 201);
    assert.match(validResponse.headers.get("content-type") ?? "", /application\/json/i);
    const validJson = (await validResponse.json()) as {
      ok?: boolean;
      requestId?: string;
      message?: string;
    };
    assert.equal(validJson.ok, true);
    assert.ok(validJson.requestId);
    assert.match(validJson.message ?? "", /schedule your walkthrough/i);

    const stored = await prisma.demoRequest.findUnique({
      where: { id: validJson.requestId },
    });
    assert.ok(stored);
    assert.equal(stored?.workEmail, email);
    assert.deepEqual(stored?.improvements, ["Email PDF ingestion", "Demand drafting"]);

    console.log("demoRequestRoute.test.ts passed");
  } finally {
    await prisma.demoRequest.deleteMany({ where: { workEmail: email } }).catch(() => undefined);
    if (server) {
      await stopTestServer(server);
    }
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
