import "dotenv/config";

import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { redis } from "../../services/queue";
import { s3 } from "../../services/storage";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = Date.now();
  const firmId = `migration-import-route-firm-${suffix}`;
  const actorUserId = `migration-import-route-user-${suffix}`;
  const originalSend = s3.send.bind(s3);
  const originalLpush = redis.lpush.bind(redis);

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Migration Import Route Test Firm",
    },
  });

  (s3 as any).send = async () => ({});
  (redis as any).lpush = async () => 1;

  const token = signToken({
    userId: actorUserId,
    firmId,
    role: Role.STAFF,
    email: "migration-import-route@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);
  let createdBatchId: string | null = null;

  try {
    const formData = new FormData();
    formData.append("label", "Route upload batch");
    formData.append("files", new Blob([Buffer.from("scan one")], { type: "application/pdf" }), "scan-one.pdf");
    formData.append("files", new Blob([Buffer.from("scan two")], { type: "application/pdf" }), "scan-two.pdf");

    const response = await fetch(`${baseUrl}/migration/import`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    assert(response.status === 201, `Expected migration import route to return 201, got ${response.status}`);
    const json = (await response.json()) as {
      ok?: boolean;
      batchId?: string;
      importedCount?: number;
      failedCount?: number;
      documentIds?: string[];
      batch?: { status: string };
    };
    assert(json.ok === true, "Expected migration import response to be ok.");
    assert(typeof json.batchId === "string" && json.batchId.startsWith("mig_"), "Expected a generated migration batch id.");
    assert(json.importedCount === 2, `Expected 2 imported files, got ${json.importedCount}`);
    assert(json.failedCount === 0, `Expected 0 failed imports, got ${json.failedCount}`);
    assert((json.documentIds?.length ?? 0) === 2, `Expected 2 created document ids, got ${json.documentIds?.length ?? 0}`);
    assert(json.batch?.status === "PROCESSING", `Expected fresh batch status PROCESSING, got ${json.batch?.status}`);
    createdBatchId = json.batchId ?? null;

    const detailResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(detailResponse.status === 200, `Expected detail route after import to return 200, got ${detailResponse.status}`);
    const detailJson = (await detailResponse.json()) as {
      ok?: boolean;
      total?: number;
      byStatus?: Record<string, number>;
      batch?: { status: string };
    };
    assert(detailJson.ok === true, "Expected detail response after import to be ok.");
    assert(detailJson.total === 2, `Expected imported batch total to be 2, got ${detailJson.total}`);
    assert((detailJson.byStatus?.RECEIVED ?? 0) === 2, `Expected 2 RECEIVED docs after import, got ${detailJson.byStatus?.RECEIVED ?? 0}`);
    assert(detailJson.batch?.status === "PROCESSING", `Expected detail batch status PROCESSING, got ${detailJson.batch?.status}`);

    console.log("Migration import route tests passed");
  } finally {
    await stopTestServer(server);
    (s3 as any).send = originalSend;
    (redis as any).lpush = originalLpush;
    if (createdBatchId) {
      await prisma.document.deleteMany({
        where: { migrationBatchId: createdBatchId },
      });
      await prisma.migrationBatch.deleteMany({
        where: { id: createdBatchId },
      });
    }
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
    const exitCode = process.exitCode ?? 0;
    await Promise.race([
      Promise.allSettled([prisma.$disconnect()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
