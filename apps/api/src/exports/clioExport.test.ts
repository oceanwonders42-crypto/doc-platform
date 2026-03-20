/**
 * Regression tests for Clio contacts/matters CSV export format.
 * Run: pnpm -C apps/api exec tsx src/exports/clioExport.test.ts
 */
import "dotenv/config";

import { prisma } from "../db/prisma";
import { generateClioContactsCsv, generateClioMattersCsv } from "./clioExport";

const DEMO_CASE_ID = "demo-case-1";
const CONTACT_HEADERS = ["first_name", "last_name", "company", "primary_phone", "email_address"];
const MATTER_HEADERS = [
  "description",
  "custom_number",
  "status",
  "client_first_name",
  "client_last_name",
  "client_company_name",
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

async function main() {
  const demoCase = await prisma.legalCase.findUnique({
    where: { id: DEMO_CASE_ID },
    select: { id: true, firmId: true },
  });
  assert(!!demoCase, "Seeded demo-case-1 was not found. Run pnpm run bootstrap:dev in apps/api first.");

  const contactsCsv = await generateClioContactsCsv(demoCase!.firmId, { caseIds: [DEMO_CASE_ID] });
  const mattersCsv = await generateClioMattersCsv(demoCase!.firmId, { caseIds: [DEMO_CASE_ID] });

  assert(contactsCsv.trim().length > 0, "Contacts CSV should be non-empty for seeded demo-case-1");
  assert(mattersCsv.trim().length > 0, "Matters CSV should be non-empty for seeded demo-case-1");
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
  assert(contact.first_name === "Alice", "Expected contacts first_name to be Alice, got " + contact.first_name);
  assert(contact.last_name === "Smith", "Expected contacts last_name to be Smith, got " + contact.last_name);
  assert(contact.company === "", "Expected contacts company to be blank, got " + contact.company);
  assert(contact.primary_phone === "", "Expected contacts primary_phone to be blank, got " + contact.primary_phone);
  assert(contact.email_address === "", "Expected contacts email_address to be blank, got " + contact.email_address);

  const matter = rowToObject(MATTER_HEADERS, matterRows[1]);
  assert(matter.description === "Smith v. State Farm", "Expected matter description to be Smith v. State Farm, got " + matter.description);
  assert(matter.custom_number === "DEMO-001", "Expected matter custom_number to be DEMO-001, got " + matter.custom_number);
  assert(matter.status === "Open", "Expected matter status to be Open, got " + matter.status);
  assert(matter.client_first_name === "Alice", "Expected matter client_first_name to be Alice, got " + matter.client_first_name);
  assert(matter.client_last_name === "Smith", "Expected matter client_last_name to be Smith, got " + matter.client_last_name);
  assert(matter.client_company_name === "", "Expected matter client_company_name to be blank, got " + matter.client_company_name);

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
