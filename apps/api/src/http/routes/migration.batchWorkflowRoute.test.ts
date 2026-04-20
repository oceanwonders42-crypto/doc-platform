import "dotenv/config";

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { pgPool } from "../../db/pg";
import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function parseZip(response: Response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  assert(buffer.length > 0, "Expected ZIP response body to be non-empty.");
  return JSZip.loadAsync(buffer);
}

async function parseWorkbook(response: Response): Promise<string[][]> {
  const buffer = Buffer.from(await response.arrayBuffer());
  assert(buffer.length > 0, "Expected XLSX response body to be non-empty.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  assert(!!worksheet, "Expected XLSX response to contain a worksheet.");
  const rows: string[][] = [];
  worksheet!.eachRow((row) => {
    const rawValues = Array.isArray(row.values) ? row.values : [];
    rows.push(rawValues.slice(1).map((cell: unknown) => (cell == null ? "" : String(cell))));
  });
  return rows;
}

async function main() {
  const suffix = Date.now();
  const firmId = `migration-batch-route-firm-${suffix}`;
  const actorUserId = `migration-batch-route-user-${suffix}`;
  const batchId = `mig_route_test_${suffix}`;
  const contactOneId = `migration-batch-route-contact-one-${suffix}`;
  const contactTwoId = `migration-batch-route-contact-two-${suffix}`;
  const caseOneId = `migration-batch-route-case-one-${suffix}`;
  const caseTwoId = `migration-batch-route-case-two-${suffix}`;
  const documentOneId = `migration-batch-route-doc-one-${suffix}`;
  const documentTwoId = `migration-batch-route-doc-two-${suffix}`;
  const createdExportIds: string[] = [];

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Migration Batch Route Test Firm",
    },
  });
  await prisma.contact.createMany({
    data: [
      {
        id: contactOneId,
        firmId,
        fullName: "Alice Routed",
        firstName: "Alice",
        lastName: "Routed",
      },
      {
        id: contactTwoId,
        firmId,
        fullName: "Bob Routed",
        firstName: "Bob",
        lastName: "Routed",
      },
    ],
  });
  await prisma.legalCase.createMany({
    data: [
      {
        id: caseOneId,
        firmId,
        title: "Alice Routed Matter",
        caseNumber: "BATCH-001",
        clientName: "Alice Routed",
        clientContactId: contactOneId,
        status: "open",
      },
      {
        id: caseTwoId,
        firmId,
        title: "Bob Routed Matter",
        caseNumber: "BATCH-002",
        clientName: "Bob Routed",
        clientContactId: contactTwoId,
        status: "open",
      },
    ],
  });
  await prisma.migrationBatch.create({
    data: {
      id: batchId,
      firmId,
      label: "Ready for Clio handoff",
      status: "READY_FOR_EXPORT",
      createdByUserId: actorUserId,
    },
  });
  await prisma.document.createMany({
    data: [
      {
        id: documentOneId,
        firmId,
        migrationBatchId: batchId,
        source: "migration",
        spacesKey: `tests/${documentOneId}.pdf`,
        originalName: "alice-scan.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        reviewState: "EXPORT_READY",
        routedCaseId: caseOneId,
        routedSystem: "manual",
        routingStatus: "routed",
        ingestedAt: new Date(),
        processedAt: new Date(),
      },
      {
        id: documentTwoId,
        firmId,
        migrationBatchId: batchId,
        source: "migration",
        spacesKey: `tests/${documentTwoId}.pdf`,
        originalName: "bob-scan.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        reviewState: "EXPORT_READY",
        routedCaseId: caseTwoId,
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
      documentOneId,
      "Alice Routed",
      "BATCH-001",
      documentTwoId,
      "Bob Routed",
      "BATCH-002",
    ]
  );

  const token = signToken({
    userId: actorUserId,
    firmId,
    role: Role.STAFF,
    email: "migration-batch-route@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const detailResponse = await fetch(`${baseUrl}/migration/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(detailResponse.status === 200, `Expected detail route to return 200, got ${detailResponse.status}`);
    const detailJson = (await detailResponse.json()) as {
      ok?: boolean;
      exportSummary?: { readyForClioExport: boolean; routedCaseIds: string[] };
    };
    assert(detailJson.ok === true, "Expected migration detail response to be ok.");
    assert(detailJson.exportSummary?.readyForClioExport === true, "Expected batch detail to report Clio export readiness.");
    assert(detailJson.exportSummary?.routedCaseIds.length === 2, "Expected 2 routed case ids in detail response.");

    const contactsResponse = await fetch(`${baseUrl}/migration/batches/${batchId}/exports/clio/contacts.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(contactsResponse.status === 200, `Expected contacts export to return 200, got ${contactsResponse.status}`);
    const contactsCsv = await contactsResponse.text();
    assert(contactsCsv.includes("First Name,Last Name,Email,Phone,Address,Company"), "Expected Clio contacts CSV header.");
    assert(contactsCsv.includes("Alice"), "Expected contacts CSV to include Alice.");
    assert(contactsCsv.includes("Bob"), "Expected contacts CSV to include Bob.");

    const contactsXlsxResponse = await fetch(`${baseUrl}/migration/batches/${batchId}/exports/clio/contacts.xlsx`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(contactsXlsxResponse.status === 200, `Expected contacts XLSX export to return 200, got ${contactsXlsxResponse.status}`);
    assert(
      (contactsXlsxResponse.headers.get("content-type") ?? "").includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
      "Expected contacts XLSX export to return workbook content."
    );
    const contactWorkbookRows = await parseWorkbook(contactsXlsxResponse);
    assert(contactWorkbookRows[0]?.join(",") === "First Name,Last Name,Email,Phone,Address,Company", "Expected contacts XLSX header.");
    assert(contactWorkbookRows.some((row) => row.includes("Alice")), "Expected contacts XLSX to include Alice.");
    assert(contactWorkbookRows.some((row) => row.includes("Bob")), "Expected contacts XLSX to include Bob.");

    const mattersResponse = await fetch(`${baseUrl}/migration/batches/${batchId}/exports/clio/matters.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(mattersResponse.status === 200, `Expected matters export to return 200, got ${mattersResponse.status}`);
    const mattersCsv = await mattersResponse.text();
    assert(mattersCsv.includes("Matter Name,Client,Matter Number,Description,Practice Area,Status"), "Expected Clio matters CSV header.");
    assert(mattersCsv.includes("BATCH-001"), "Expected matters CSV to include BATCH-001.");
    assert(mattersCsv.includes("BATCH-002"), "Expected matters CSV to include BATCH-002.");

    const mattersXlsxResponse = await fetch(`${baseUrl}/migration/batches/${batchId}/exports/clio/matters.xlsx`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(mattersXlsxResponse.status === 200, `Expected matters XLSX export to return 200, got ${mattersXlsxResponse.status}`);
    assert(
      (mattersXlsxResponse.headers.get("content-type") ?? "").includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
      "Expected matters XLSX export to return workbook content."
    );
    const matterWorkbookRows = await parseWorkbook(mattersXlsxResponse);
    assert(
      matterWorkbookRows[0]?.join(",") === "Matter Name,Client,Matter Number,Description,Practice Area,Status",
      "Expected matters XLSX header."
    );
    assert(matterWorkbookRows.some((row) => row.includes("BATCH-001")), "Expected matters XLSX to include BATCH-001.");
    assert(matterWorkbookRows.some((row) => row.includes("BATCH-002")), "Expected matters XLSX to include BATCH-002.");

    const handoffResponse = await fetch(`${baseUrl}/migration/batches/${batchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ allowReexport: true, reexportReason: "test_run" }),
    });
    assert(handoffResponse.status === 200, `Expected batch handoff route to return 200, got ${handoffResponse.status}`);
    assert(
      (handoffResponse.headers.get("content-type") ?? "").includes("application/zip"),
      "Expected batch handoff to return a ZIP file."
    );

    const zip = await parseZip(handoffResponse);
    const zipDatePart = new Date().toISOString().slice(0, 10);
    const zipEntryNames = Object.keys(zip.files).sort();
    assert(
      JSON.stringify(zipEntryNames) ===
        JSON.stringify([
          `clio-contacts-batch-${zipDatePart}.csv`,
          `clio-contacts-batch-${zipDatePart}.xlsx`,
          `clio-matters-batch-${zipDatePart}.csv`,
          `clio-matters-batch-${zipDatePart}.xlsx`,
          "manifest.json",
        ]),
      `Expected handoff ZIP to include CSV and XLSX exports, got ${JSON.stringify(zipEntryNames)}`
    );
    const manifestText = await zip.file("manifest.json")?.async("string");
    assert(typeof manifestText === "string" && manifestText.length > 0, "Expected manifest.json in ZIP response.");
    assert(manifestText!.includes(caseOneId), "Expected ZIP manifest to include the first case id.");
    assert(manifestText!.includes(caseTwoId), "Expected ZIP manifest to include the second case id.");

    const handoffLinks = await prisma.migrationBatchClioHandoff.findMany({
      where: { batchId, firmId },
      include: {
        clioHandoffExport: {
          select: {
            id: true,
            contactsFileName: true,
            mattersFileName: true,
          },
        },
      },
    });
    createdExportIds.push(...handoffLinks.map((item) => item.clioHandoffExport.id));
    assert(handoffLinks.length === 1, `Expected one migration batch handoff link, got ${handoffLinks.length}`);
    assert(
      handoffLinks[0]?.clioHandoffExport.contactsFileName?.endsWith(".csv") === true,
      "Expected recorded handoff to include a contacts CSV filename."
    );
    assert(
      handoffLinks[0]?.clioHandoffExport.mattersFileName?.endsWith(".csv") === true,
      "Expected recorded handoff to include a matters CSV filename."
    );

    const detailAfterHandoff = await fetch(`${baseUrl}/migration/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(detailAfterHandoff.status === 200, `Expected detail route after handoff to return 200, got ${detailAfterHandoff.status}`);
    const detailAfterJson = (await detailAfterHandoff.json()) as {
      ok?: boolean;
      batch?: { status: string };
      handoffHistory?: Array<{ exportId: string }>;
    };
    assert(detailAfterJson.ok === true, "Expected detail-after-handoff response to be ok.");
    assert(detailAfterJson.batch?.status === "EXPORTED", `Expected batch status EXPORTED after handoff, got ${detailAfterJson.batch?.status}`);
    assert((detailAfterJson.handoffHistory?.length ?? 0) === 1, `Expected one handoff history item, got ${detailAfterJson.handoffHistory?.length ?? 0}`);

    console.log("Migration batch workflow route tests passed");
  } finally {
    await stopTestServer(server);
    if (createdExportIds.length > 0) {
      await prisma.clioHandoffExport.deleteMany({
        where: { id: { in: createdExportIds } },
      });
    }
    await prisma.migrationBatchClioHandoff.deleteMany({
      where: { batchId },
    });
    await pgPool.query(`delete from document_recognition where document_id = any($1)`, [[documentOneId, documentTwoId]]);
    await prisma.document.deleteMany({
      where: { id: { in: [documentOneId, documentTwoId] } },
    });
    await prisma.migrationBatch.deleteMany({
      where: { id: batchId },
    });
    await prisma.legalCase.deleteMany({
      where: { id: { in: [caseOneId, caseTwoId] } },
    });
    await prisma.contact.deleteMany({
      where: { id: { in: [contactOneId, contactTwoId] } },
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
    const exitCode = process.exitCode ?? 0;
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
