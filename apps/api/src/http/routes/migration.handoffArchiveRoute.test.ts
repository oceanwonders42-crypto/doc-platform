import "dotenv/config";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { pgPool } from "../../db/pg";
import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { s3 } from "../../services/storage";
import { app } from "../server";
import { assert, parseZip, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `migration-handoff-download-firm-${suffix}`;
  const actorUserId = `migration-handoff-download-user-${suffix}`;
  const batchId = `mig_handoff_download_${suffix}`;
  const contactId = `migration-handoff-download-contact-${suffix}`;
  const caseId = `migration-handoff-download-case-${suffix}`;
  const firstDocumentId = `migration-handoff-download-doc-one-${suffix}`;
  const secondDocumentId = `migration-handoff-download-doc-two-${suffix}`;
  const storedObjects = new Map<string, Buffer>();
  const originalSend = s3.send.bind(s3);

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Migration Handoff Download Test Firm",
    },
  });
  await prisma.contact.create({
    data: {
      id: contactId,
      firmId,
      fullName: "Handoff Download Client",
      firstName: "Handoff",
      lastName: "Download Client",
    },
  });
  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Handoff Download Matter",
      caseNumber: `HANDOFF-${suffix}`,
      clientName: "Handoff Download Client",
      clientContactId: contactId,
      status: "open",
    },
  });
  await prisma.migrationBatch.create({
    data: {
      id: batchId,
      firmId,
      label: "Stored handoff archive batch",
      status: "READY_FOR_EXPORT",
      createdByUserId: actorUserId,
    },
  });
  await prisma.document.createMany({
    data: [
      {
        id: firstDocumentId,
        firmId,
        migrationBatchId: batchId,
        source: "migration",
        spacesKey: `tests/${firstDocumentId}.pdf`,
        originalName: "handoff-download-one.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        reviewState: "EXPORT_READY",
        routedCaseId: caseId,
        routedSystem: "manual",
        routingStatus: "routed",
        ingestedAt: new Date(),
        processedAt: new Date(),
      },
      {
        id: secondDocumentId,
        firmId,
        migrationBatchId: batchId,
        source: "migration",
        spacesKey: `tests/${secondDocumentId}.pdf`,
        originalName: "handoff-download-two.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        reviewState: "EXPORT_READY",
        routedCaseId: caseId,
        routedSystem: "manual",
        routingStatus: "routed",
        ingestedAt: new Date(),
        processedAt: new Date(),
      },
    ],
  });
  await pgPool.query(
    `insert into document_recognition
      (document_id, client_name, case_number, doc_type, confidence, match_confidence, match_reason, updated_at)
     values
      ($1, $2, $3, 'medical_record', 0.95, 0.99, 'Exact case match', now()),
      ($4, $5, $6, 'medical_record', 0.94, 0.99, 'Exact case match', now())
     on conflict (document_id) do update set
       client_name = excluded.client_name,
       case_number = excluded.case_number,
       doc_type = excluded.doc_type,
       confidence = excluded.confidence,
       match_confidence = excluded.match_confidence,
       match_reason = excluded.match_reason,
       updated_at = now()`,
    [
      firstDocumentId,
      "Handoff Download Client",
      `HANDOFF-${suffix}`,
      secondDocumentId,
      "Handoff Download Client",
      `HANDOFF-${suffix}`,
    ]
  );

  (s3 as any).send = async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      const key = String(command.input.Key ?? "");
      const body = command.input.Body;
      const buffer = Buffer.isBuffer(body)
        ? body
        : body instanceof Uint8Array
          ? Buffer.from(body)
          : typeof body === "string"
            ? Buffer.from(body)
            : Buffer.alloc(0);
      storedObjects.set(key, buffer);
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const key = String(command.input.Key ?? "");
      const buffer = storedObjects.get(key);
      if (!buffer) {
        throw new Error(`Missing stored test object for key ${key}`);
      }
      return { Body: Readable.from(buffer) };
    }
    return {};
  };

  const token = signToken({
    userId: actorUserId,
    firmId,
    role: Role.STAFF,
    email: "migration-handoff-download@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const firstExport = await fetch(`${baseUrl}/migration/batches/${batchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert(firstExport.status === 200, `Expected first handoff export to return 200, got ${firstExport.status}`);
    await parseZip(firstExport);

    const secondExport = await fetch(`${baseUrl}/migration/batches/${batchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ allowReexport: true, reexportReason: "history_download_test" }),
    });
    assert(secondExport.status === 200, `Expected second handoff export to return 200, got ${secondExport.status}`);
    await parseZip(secondExport);

    const handoffExports = await prisma.clioHandoffExport.findMany({
      where: {
        firmId,
        migrationBatchHandoffs: {
          some: { batchId },
        },
      },
      orderBy: [{ exportedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        archiveFileName: true,
        archiveStorageKey: true,
      },
    });
    assert(handoffExports.length === 2, `Expected 2 handoff exports, got ${handoffExports.length}`);
    assert(
      handoffExports.every((item) => typeof item.archiveStorageKey === "string" && item.archiveStorageKey.length > 0),
      "Expected all handoff exports to persist archive storage keys."
    );

    const detailResponse = await fetch(`${baseUrl}/migration/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(detailResponse.status === 200, `Expected migration batch detail to return 200, got ${detailResponse.status}`);
    const detailJson = (await detailResponse.json()) as {
      ok?: boolean;
      handoffHistory?: Array<{ exportId: string; archiveAvailable?: boolean }>;
    };
    assert(detailJson.ok === true, "Expected migration batch detail payload to be ok.");
    assert((detailJson.handoffHistory?.length ?? 0) === 2, `Expected 2 handoff history entries, got ${detailJson.handoffHistory?.length ?? 0}`);
    assert(
      detailJson.handoffHistory?.every((item) => item.archiveAvailable === true) === true,
      "Expected handoff history to report stored archive availability for both exports."
    );

    const exportCountBeforeDownloads = await prisma.clioHandoffExport.count({ where: { firmId } });
    const auditCountBeforeDownloads = await prisma.systemErrorLog.count({
      where: { firmId, area: "clio_handoff_audit" },
    });
    const aiTelemetryCountBeforeDownloads = await prisma.aiTaskTelemetry.count({ where: { firmId } });

    const olderExport = handoffExports[0];
    const latestExport = handoffExports[handoffExports.length - 1];
    const latestDownload = await fetch(
      `${baseUrl}/migration/batches/${batchId}/exports/clio/handoff/${latestExport.id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert(latestDownload.status === 200, `Expected latest archive download to return 200, got ${latestDownload.status}`);
    const latestDownloadBuffer = Buffer.from(await latestDownload.arrayBuffer());
    assert(
      latestDownloadBuffer.equals(storedObjects.get(latestExport.archiveStorageKey!) ?? Buffer.alloc(0)),
      "Expected latest archive download to match the stored ZIP bytes."
    );
    const latestZip = await parseZip(
      new Response(latestDownloadBuffer, {
        headers: { "content-type": "application/zip" },
      })
    );
    const latestManifest = await latestZip.file("manifest.json")?.async("string");
    assert(
      typeof latestManifest === "string" && latestManifest.includes(caseId),
      "Expected latest archive manifest to include the routed case id."
    );

    const olderDownload = await fetch(
      `${baseUrl}/migration/batches/${batchId}/exports/clio/handoff/${olderExport.id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert(olderDownload.status === 200, `Expected older archive download to return 200, got ${olderDownload.status}`);
    const olderDownloadBuffer = Buffer.from(await olderDownload.arrayBuffer());
    assert(
      olderDownloadBuffer.equals(storedObjects.get(olderExport.archiveStorageKey!) ?? Buffer.alloc(0)),
      "Expected older archive download to match the stored ZIP bytes."
    );
    const olderZip = await parseZip(
      new Response(olderDownloadBuffer, {
        headers: { "content-type": "application/zip" },
      })
    );
    const olderManifest = await olderZip.file("manifest.json")?.async("string");
    assert(
      typeof olderManifest === "string" && olderManifest.includes(caseId),
      "Expected older archive manifest to include the routed case id."
    );

    const exportCountAfterDownloads = await prisma.clioHandoffExport.count({ where: { firmId } });
    const auditCountAfterDownloads = await prisma.systemErrorLog.count({
      where: { firmId, area: "clio_handoff_audit" },
    });
    const aiTelemetryCountAfterDownloads = await prisma.aiTaskTelemetry.count({ where: { firmId } });

    assert(
      exportCountAfterDownloads === exportCountBeforeDownloads,
      "Expected archive re-downloads to avoid creating new handoff export records."
    );
    assert(
      auditCountAfterDownloads === auditCountBeforeDownloads,
      "Expected archive re-downloads to avoid creating new Clio handoff audit events."
    );
    assert(
      aiTelemetryCountAfterDownloads === aiTelemetryCountBeforeDownloads,
      "Expected archive re-downloads to avoid any AI telemetry changes."
    );

    console.log("Migration handoff archive download route tests passed");
  } finally {
    await stopTestServer(server);
    (s3 as any).send = originalSend;
    await prisma.migrationBatchClioHandoff.deleteMany({ where: { batchId } });
    await prisma.clioHandoffExport.deleteMany({ where: { firmId } });
    await prisma.document.deleteMany({ where: { id: { in: [firstDocumentId, secondDocumentId] } } });
    await pgPool.query(`delete from document_recognition where document_id = any($1)`, [[firstDocumentId, secondDocumentId]]);
    await prisma.migrationBatch.deleteMany({ where: { id: batchId } });
    await prisma.legalCase.deleteMany({ where: { id: caseId } });
    await prisma.contact.deleteMany({ where: { id: contactId } });
    await prisma.firm.deleteMany({ where: { id: firmId } });
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
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
