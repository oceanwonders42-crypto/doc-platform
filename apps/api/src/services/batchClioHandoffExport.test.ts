/**
 * Regression tests for batch Clio handoff ZIP export.
 * Run: pnpm -C apps/api exec tsx src/services/batchClioHandoffExport.test.ts
 */
import "dotenv/config";

import JSZip from "jszip";
import { ClioHandoffCaseStatus, ClioHandoffExportSubtype, ClioHandoffExportType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { generateClioContactsCsv, generateClioMattersCsv } from "../exports/clioExport";
import {
  buildBatchClioHandoffExport,
  type BatchClioHandoffManifest,
} from "./batchClioHandoffExport";

const FIXED_EXPORT_DATE = new Date("2026-03-19T15:30:00.000Z");
const INCLUDED_CASE_IDS = ["demo-case-1", "demo-case-2"];
const SKIPPED_CASE_ID = "demo-case-4";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === `"`) {
      if (inQuotes && next === `"`) {
        cell += `"`;
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function assertSameRow(actual: string[], expected: string[], label: string) {
  assert(actual.length === expected.length, `${label} width mismatch: expected ${expected.length}, got ${actual.length}`);
  expected.forEach((value, index) => {
    assert(actual[index] === value, `${label} mismatch at column ${index + 1}: expected ${value}, got ${actual[index]}`);
  });
}

function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((header, index) => {
    out[header] = row[index] ?? "";
  });
  return out;
}

async function main() {
  const demoCase = await prisma.legalCase.findUnique({
    where: { id: INCLUDED_CASE_IDS[0] },
    select: { id: true, firmId: true },
  });
  assert(!!demoCase, "Seeded demo-case-1 was not found. Run pnpm run bootstrap:dev in apps/api first.");
  await prisma.clioHandoffExport.deleteMany({
    where: {
      firmId: demoCase!.firmId,
      memberships: {
        some: {
          caseId: { in: [...INCLUDED_CASE_IDS, SKIPPED_CASE_ID] },
        },
      },
    },
  });

  const singleCaseContactsCsv = await generateClioContactsCsv(demoCase!.firmId, {
    caseIds: [INCLUDED_CASE_IDS[0]],
  });
  const singleCaseMattersCsv = await generateClioMattersCsv(demoCase!.firmId, {
    caseIds: [INCLUDED_CASE_IDS[0]],
  });

  const singleContactRows = parseCsv(singleCaseContactsCsv);
  const singleMatterRows = parseCsv(singleCaseMattersCsv);
  assert(singleContactRows.length >= 2, "Single-case contacts CSV should include header plus data row.");
  assert(singleMatterRows.length >= 2, "Single-case matters CSV should include header plus data row.");

  const singleContact = rowToObject(singleContactRows[0], singleContactRows[1]);
  assert(singleContact.first_name === "Alice", "Single-case contacts export should still use Alice as first_name.");
  assert(singleContact.last_name === "Smith", "Single-case contacts export should still use Smith as last_name.");

  const singleMatter = rowToObject(singleMatterRows[0], singleMatterRows[1]);
  assert(singleMatter.description === "Smith v. State Farm", "Single-case matters export should still preserve the case title.");
  assert(singleMatter.custom_number === "DEMO-001", "Single-case matters export should still preserve the case number.");

  const batch = await buildBatchClioHandoffExport({
    firmId: demoCase!.firmId,
    caseIds: ["demo-case-2", INCLUDED_CASE_IDS[0], SKIPPED_CASE_ID, "missing-case"],
    exportedAt: FIXED_EXPORT_DATE,
  });

  assert(batch.fileName === "clio-handoff-batch-2026-03-19.zip", "Unexpected batch ZIP filename: " + batch.fileName);
  assert(batch.zipBuffer.length > 0, "Batch ZIP buffer should be non-empty.");

  const zip = await JSZip.loadAsync(batch.zipBuffer);
  const zipEntryNames = Object.keys(zip.files).sort();
  assertSameRow(
    zipEntryNames,
    [
      "clio-contacts-batch-2026-03-19.csv",
      "clio-matters-batch-2026-03-19.csv",
      "manifest.json",
    ],
    "zip entries"
  );

  const contactsCsv = await zip.file(batch.contactsFileName)?.async("string");
  const mattersCsv = await zip.file(batch.mattersFileName)?.async("string");
  const manifestText = await zip.file(batch.manifestFileName)?.async("string");

  assert(typeof contactsCsv === "string" && contactsCsv.trim().length > 0, "Batch contacts CSV should be present and non-empty.");
  assert(typeof mattersCsv === "string" && mattersCsv.trim().length > 0, "Batch matters CSV should be present and non-empty.");
  assert(typeof manifestText === "string" && manifestText.trim().length > 0, "Batch manifest should be present and non-empty.");

  const contactRows = parseCsv(contactsCsv!);
  const matterRows = parseCsv(mattersCsv!);
  assertSameRow(contactRows[0], singleContactRows[0], "contacts header");
  assertSameRow(matterRows[0], singleMatterRows[0], "matters header");

  assert(contactRows.length >= 3, "Batch contacts CSV should include a header and rows from multiple cases.");
  assert(matterRows.length >= 3, "Batch matters CSV should include a header and rows from multiple cases.");

  const contactFirstNames = contactRows.slice(1).map((row) => rowToObject(contactRows[0], row).first_name);
  assert(contactFirstNames.includes("Alice"), "Batch contacts CSV should include Alice.");
  assert(contactFirstNames.includes("Bob"), "Batch contacts CSV should include Bob.");

  const matterNumbers = matterRows.slice(1).map((row) => rowToObject(matterRows[0], row).custom_number);
  assertSameRow(matterNumbers, ["DEMO-001", "DEMO-002"], "matter order");

  const manifest = JSON.parse(manifestText!) as BatchClioHandoffManifest;
  assert(manifest.exportTimestamp === FIXED_EXPORT_DATE.toISOString(), "Manifest export timestamp should use the requested export time.");
  assertSameRow(manifest.includedCaseIds, INCLUDED_CASE_IDS, "manifest includedCaseIds");
  assertSameRow(manifest.includedCaseNumbers, ["DEMO-001", "DEMO-002"], "manifest includedCaseNumbers");
  assert(manifest.contactsRowCount === 2, "Manifest should report 2 contact rows, got " + manifest.contactsRowCount);
  assert(manifest.mattersRowCount === 2, "Manifest should report 2 matter rows, got " + manifest.mattersRowCount);
  assert(
    manifest.skippedCases.some(
      (item) => item.id === SKIPPED_CASE_ID && item.reason === "This case has no routed documents to export yet."
    ),
    "Manifest should record demo-case-4 as skipped for lacking export-ready documents."
  );
  assert(
    manifest.skippedCases.some((item) => item.id === "missing-case" && item.reason === "Case not found"),
    "Manifest should record missing-case as skipped because it does not exist."
  );

  await prisma.clioHandoffExport.create({
    data: {
      firmId: demoCase!.firmId,
      exportType: ClioHandoffExportType.SINGLE_CASE,
      exportSubtype: ClioHandoffExportSubtype.CONTACTS,
      actorLabel: "service-test@example.com",
      contactsFileName: "DEMO-001-contact.csv",
      contactsRowCount: 1,
      manifestJson: {
        exportTimestamp: FIXED_EXPORT_DATE.toISOString(),
        includedCaseIds: [INCLUDED_CASE_IDS[0]],
        includedCaseNumbers: ["DEMO-001"],
        reexportedCaseIds: [],
        reexportedCaseNumbers: [],
        skippedCases: [],
        contactsRowCount: 1,
        mattersRowCount: 0,
      },
      exportedAt: FIXED_EXPORT_DATE,
      memberships: {
        create: {
          firmId: demoCase!.firmId,
          caseId: INCLUDED_CASE_IDS[0],
          caseNumber: "DEMO-001",
          caseTitle: "Smith v. State Farm",
          clientName: "Alice Smith",
          status: ClioHandoffCaseStatus.INCLUDED,
        },
      },
    },
  });

  const guardedBatch = await buildBatchClioHandoffExport({
    firmId: demoCase!.firmId,
    caseIds: ["demo-case-2", INCLUDED_CASE_IDS[0], SKIPPED_CASE_ID],
    exportedAt: FIXED_EXPORT_DATE,
  });
  assertSameRow(guardedBatch.manifest.includedCaseIds, ["demo-case-2"], "guarded manifest includedCaseIds");
  assert(
    guardedBatch.manifest.skippedCases.some(
      (item) => item.id === INCLUDED_CASE_IDS[0] && item.reason.includes("Already handed off to Clio")
    ),
    "Guarded batch export should skip already-exported demo-case-1 by default."
  );

  const overrideBatch = await buildBatchClioHandoffExport({
    firmId: demoCase!.firmId,
    caseIds: ["demo-case-2", INCLUDED_CASE_IDS[0], SKIPPED_CASE_ID],
    allowReexport: true,
    exportedAt: FIXED_EXPORT_DATE,
  });
  assertSameRow(overrideBatch.manifest.includedCaseIds, INCLUDED_CASE_IDS, "override manifest includedCaseIds");
  assertSameRow(overrideBatch.manifest.reexportedCaseIds, [INCLUDED_CASE_IDS[0]], "override manifest reexportedCaseIds");

  console.log("Batch Clio handoff export tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const demoCase = await prisma.legalCase.findUnique({
      where: { id: INCLUDED_CASE_IDS[0] },
      select: { firmId: true },
    });
    if (demoCase) {
      await prisma.clioHandoffExport.deleteMany({
        where: {
          firmId: demoCase.firmId,
          memberships: {
            some: {
              caseId: { in: [...INCLUDED_CASE_IDS, SKIPPED_CASE_ID] },
            },
          },
        },
      });
    }
    await prisma.$disconnect();
  });
