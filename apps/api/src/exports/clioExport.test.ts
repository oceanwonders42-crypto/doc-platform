/**
 * Regression tests for Clio contacts/matters CSV + XLSX export format.
 * Run: pnpm -C apps/api exec tsx src/exports/clioExport.test.ts
 */
import "dotenv/config";

import ExcelJS from "exceljs";
import { prisma } from "../db/prisma";
import {
  generateClioContactsCsv,
  generateClioContactsXlsx,
  generateClioMattersCsv,
  generateClioMattersXlsx,
} from "./clioExport";

const DEMO_CASE_ID = "demo-case-1";
const CONTACT_HEADERS = ["First Name", "Last Name", "Email", "Phone", "Address", "Company"];
const MATTER_HEADERS = [
  "Matter Name",
  "Client",
  "Matter Number",
  "Description",
  "Practice Area",
  "Status",
];

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

function assertHeader(actual: string[], expected: string[], label: string) {
  assert(actual.length === expected.length, label + " header width mismatch: expected " + expected.length + ", got " + actual.length);
  expected.forEach((value, index) => {
    assert(actual[index] === value, label + " header mismatch at column " + (index + 1) + ": expected " + value + ", got " + actual[index]);
  });
}

function assertConsistentRowWidth(rows: string[][], expectedWidth: number, label: string) {
  rows.forEach((row, index) => {
    assert(row.length === expectedWidth, label + " row " + (index + 1) + " width mismatch: expected " + expectedWidth + ", got " + row.length);
  });
}

function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((header, index) => {
    out[header] = row[index] ?? "";
  });
  return out;
}

async function parseWorkbook(
  buffer: Uint8Array | ArrayBuffer
): Promise<{ sheetName: string; rows: string[][]; frozenHeader: boolean }> {
  const workbook = new ExcelJS.Workbook();
  const workbookInput = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  await workbook.xlsx.load(workbookInput as any);
  const worksheet = workbook.worksheets[0];
  assert(!!worksheet, "Expected workbook to contain a worksheet.");
  const rows: string[][] = [];
  worksheet!.eachRow((row) => {
    const rawValues = Array.isArray(row.values) ? row.values : [];
    rows.push(rawValues.slice(1).map((cell: unknown) => (cell == null ? "" : String(cell))));
  });

  const firstView = worksheet!.views?.[0];
  return {
    sheetName: worksheet!.name,
    rows,
    frozenHeader: firstView?.state === "frozen" && Number(firstView?.ySplit ?? 0) === 1,
  };
}

async function main() {
  const demoCase = await prisma.legalCase.findUnique({
    where: { id: DEMO_CASE_ID },
    select: { id: true, firmId: true },
  });
  assert(!!demoCase, "Seeded demo-case-1 was not found. Run pnpm run bootstrap:dev in apps/api first.");

  const contactsCsv = await generateClioContactsCsv(demoCase!.firmId, { caseIds: [DEMO_CASE_ID] });
  const mattersCsv = await generateClioMattersCsv(demoCase!.firmId, { caseIds: [DEMO_CASE_ID] });
  const contactsXlsx = await generateClioContactsXlsx(demoCase!.firmId, { caseIds: [DEMO_CASE_ID] });
  const mattersXlsx = await generateClioMattersXlsx(demoCase!.firmId, { caseIds: [DEMO_CASE_ID] });

  assert(contactsCsv.trim().length > 0, "Contacts CSV should be non-empty for seeded demo-case-1");
  assert(mattersCsv.trim().length > 0, "Matters CSV should be non-empty for seeded demo-case-1");
  assert(contactsXlsx.length > 0, "Contacts XLSX should be non-empty for seeded demo-case-1");
  assert(mattersXlsx.length > 0, "Matters XLSX should be non-empty for seeded demo-case-1");
  assert(!contactsCsv.includes("\r"), "Contacts CSV should use parseable LF line endings");
  assert(!mattersCsv.includes("\r"), "Matters CSV should use parseable LF line endings");

  const contactRows = parseCsv(contactsCsv);
  const matterRows = parseCsv(mattersCsv);

  assert(contactRows.length >= 2, "Contacts CSV should include header plus at least one row, got " + contactRows.length);
  assert(matterRows.length >= 2, "Matters CSV should include header plus at least one row, got " + matterRows.length);

  assertHeader(contactRows[0], CONTACT_HEADERS, "contacts");
  assertHeader(matterRows[0], MATTER_HEADERS, "matters");

  assertConsistentRowWidth(contactRows, CONTACT_HEADERS.length, "contacts");
  assertConsistentRowWidth(matterRows, MATTER_HEADERS.length, "matters");

  const contact = rowToObject(CONTACT_HEADERS, contactRows[1]);
  assert(contact["First Name"] === "Alice", "Expected contacts First Name to be Alice, got " + contact["First Name"]);
  assert(contact["Last Name"] === "Smith", "Expected contacts Last Name to be Smith, got " + contact["Last Name"]);
  assert(contact.Email === "", "Expected contacts Email to be blank, got " + contact.Email);
  assert(contact.Phone === "", "Expected contacts Phone to be blank, got " + contact.Phone);
  assert(contact.Address === "", "Expected contacts Address to be blank, got " + contact.Address);
  assert(contact.Company === "", "Expected contacts Company to be blank, got " + contact.Company);

  const matter = rowToObject(MATTER_HEADERS, matterRows[1]);
  assert(matter["Matter Name"] === "Smith v. State Farm", "Expected Matter Name to be Smith v. State Farm, got " + matter["Matter Name"]);
  assert(matter.Client === "Alice Smith", "Expected Client to be Alice Smith, got " + matter.Client);
  assert(matter["Matter Number"] === "DEMO-001", "Expected Matter Number to be DEMO-001, got " + matter["Matter Number"]);
  assert(matter.Description === "Smith v. State Farm", "Expected Description to be Smith v. State Farm, got " + matter.Description);
  assert(matter["Practice Area"] === "", "Expected Practice Area to be blank, got " + matter["Practice Area"]);
  assert(matter.Status === "Open", "Expected Status to be Open, got " + matter.Status);

  const contactLabels = new Set(
    contactRows.slice(1).map((row) => {
      const item = rowToObject(CONTACT_HEADERS, row);
      return [item["First Name"], item["Last Name"]].filter(Boolean).join(" ") || item.Company;
    })
  );
  assert(contactLabels.has(matter.Client), "Expected matter Client to link to an exported contact row.");

  const contactsWorkbook = await parseWorkbook(contactsXlsx);
  const mattersWorkbook = await parseWorkbook(mattersXlsx);
  assert(contactsWorkbook.sheetName === "Contacts", "Expected contacts worksheet to be named Contacts.");
  assert(mattersWorkbook.sheetName === "Matters", "Expected matters worksheet to be named Matters.");
  assert(contactsWorkbook.frozenHeader, "Expected contacts worksheet to freeze the header row.");
  assert(mattersWorkbook.frozenHeader, "Expected matters worksheet to freeze the header row.");
  assertHeader(contactsWorkbook.rows[0] ?? [], CONTACT_HEADERS, "contacts xlsx");
  assertHeader(mattersWorkbook.rows[0] ?? [], MATTER_HEADERS, "matters xlsx");
  assert(
    JSON.stringify(contactsWorkbook.rows) === JSON.stringify(contactRows),
    "Expected contacts XLSX rows to match the normalized CSV rows exactly."
  );
  assert(
    JSON.stringify(mattersWorkbook.rows) === JSON.stringify(matterRows),
    "Expected matters XLSX rows to match the normalized CSV rows exactly."
  );

  const stamp = Date.now().toString();
  const dedupeEmail = `clio-dedupe-${stamp}@example.com`;
  let duplicateContactIds: string[] = [];
  let temporaryCaseIds: string[] = [];

  try {
    const createdContacts = await prisma.$transaction([
      prisma.contact.create({
        data: {
          firmId: demoCase!.firmId,
          firstName: "Dana",
          lastName: "Example",
          fullName: "Dana Example",
          email: dedupeEmail,
          phone: "5551234567",
          address1: "123 Main St",
          address2: "Suite 4",
          city: "Orlando",
          state: "FL",
          postalCode: "32801",
        },
        select: { id: true },
      }),
      prisma.contact.create({
        data: {
          firmId: demoCase!.firmId,
          firstName: "Dana",
          lastName: "Example",
          fullName: "Dana Example",
          email: dedupeEmail,
        },
        select: { id: true },
      }),
    ]);
    duplicateContactIds = createdContacts.map((item) => item.id);

    const createdCases = await prisma.$transaction([
      prisma.legalCase.create({
        data: {
          firmId: demoCase!.firmId,
          caseNumber: `CLIO-DEDUPE-${stamp}-1`,
          title: "Example Matter One",
          status: "open",
          notes: "First dedupe-proof matter",
          clientContactId: duplicateContactIds[0],
        },
        select: { id: true, caseNumber: true },
      }),
      prisma.legalCase.create({
        data: {
          firmId: demoCase!.firmId,
          caseNumber: `CLIO-DEDUPE-${stamp}-2`,
          title: "Example Matter Two",
          status: "pending",
          clientContactId: duplicateContactIds[1],
        },
        select: { id: true, caseNumber: true },
      }),
      prisma.legalCase.create({
        data: {
          firmId: demoCase!.firmId,
          caseNumber: `CLIO-PLACEHOLDER-${stamp}`,
          status: "closed",
        },
        select: { id: true, caseNumber: true },
      }),
    ]);
    temporaryCaseIds = createdCases.map((item) => item.id);

    const exportCaseIds = createdCases.map((item) => item.id);
    const dedupedContactsCsv = await generateClioContactsCsv(demoCase!.firmId, {
      caseIds: exportCaseIds,
      preserveCaseOrder: true,
    });
    const dedupedMattersCsv = await generateClioMattersCsv(demoCase!.firmId, {
      caseIds: exportCaseIds,
      preserveCaseOrder: true,
    });

    const dedupedContactRows = parseCsv(dedupedContactsCsv);
    const dedupedMatterRows = parseCsv(dedupedMattersCsv);
    const dedupedContacts = dedupedContactRows.slice(1).map((row) => rowToObject(CONTACT_HEADERS, row));
    const dedupedMatters = dedupedMatterRows.slice(1).map((row) => rowToObject(MATTER_HEADERS, row));

    assert(dedupedContacts.length === 2, "Expected one deduped client row plus one placeholder contact row.");

    const danaContact = dedupedContacts.find((item) => item.Email === dedupeEmail);
    assert(!!danaContact, "Expected one deduped Dana Example contact row.");
    assert(danaContact!["First Name"] === "Dana", "Expected deduped contact First Name to be Dana.");
    assert(danaContact!["Last Name"] === "Example", "Expected deduped contact Last Name to be Example.");
    assert(danaContact!.Phone === "(555) 123-4567", "Expected phone normalization to format the US phone number.");
    assert(
      danaContact!.Address === "123 Main St, Suite 4, Orlando, FL 32801",
      "Expected address normalization to produce a single import-safe address string."
    );

    const placeholderCaseNumber = createdCases[2].caseNumber!;
    const placeholderClientLabel = `Unknown Client ${placeholderCaseNumber}`;
    const placeholderMatter = dedupedMatters.find((item) => item["Matter Number"] === placeholderCaseNumber);
    assert(!!placeholderMatter, "Expected placeholder matter row to be present.");
    assert(
      placeholderMatter!.Client === placeholderClientLabel,
      "Expected placeholder matter client label to match the generated placeholder contact label."
    );
    assert(
      placeholderMatter!["Matter Name"] === `Case - ${placeholderCaseNumber}`,
      "Expected blank-titled matter to fall back to Case - {caseNumber}."
    );
    assert(placeholderMatter!.Status === "Closed", "Expected closed placeholder matter to export as Closed.");

    const dedupedContactLabels = new Set(
      dedupedContacts.map((item) => [item["First Name"], item["Last Name"]].filter(Boolean).join(" ") || item.Company)
    );
    dedupedMatters.forEach((item) => {
      assert(item.Client.length > 0, "Expected every matter to have a non-empty Client value.");
      assert(
        dedupedContactLabels.has(item.Client),
        `Expected matter client ${item.Client} to match an exported contact row.`
      );
      assert(["Open", "Closed"].includes(item.Status), `Unexpected matter status ${item.Status}`);
    });
  } finally {
    if (temporaryCaseIds.length > 0) {
      await prisma.legalCase.deleteMany({ where: { id: { in: temporaryCaseIds } } });
    }
    if (duplicateContactIds.length > 0) {
      await prisma.contact.deleteMany({ where: { id: { in: duplicateContactIds } } });
    }
  }

  console.log("Clio export CSV format tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
