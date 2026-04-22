/**
 * Clio CSV export: contacts and matters from LegalCase data.
 * Prefers persisted case client contacts when present and falls back to LegalCase.clientName.
 */
import { prisma } from "../db/prisma";
import { csvRow, toValidUtf8 } from "./csvEscape";

type ClioExportOptions = {
  caseIds?: string[];
  preserveCaseOrder?: boolean;
};

export const CLIO_CONTACT_HEADERS = [
  "first_name",
  "last_name",
  "company",
  "primary_phone",
  "email_address",
] as const;

export const CLIO_MATTER_HEADERS = [
  "description",
  "custom_number",
  "status",
  "client_first_name",
  "client_last_name",
  "client_company_name",
] as const;

export type ClioContactRow = {
  first_name: string;
  last_name: string;
  company: string;
  primary_phone: string;
  email_address: string;
};

export type ClioMatterRow = {
  description: string;
  custom_number: string;
  status: string;
  client_first_name: string;
  client_last_name: string;
  client_company_name: string;
};

function sanitize(s: string | null | undefined): string {
  if (!s || typeof s !== "string") return "";
  return toValidUtf8(s.trim());
}

function splitClientName(name: string): { firstName: string; lastName: string; company: string } {
  const t = sanitize(name);
  if (!t) return { firstName: "", lastName: "", company: "" };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "", company: "" };
  if (parts.length === 1) {
    return { firstName: "", lastName: parts[0], company: "" };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName, company: "" };
}

function formatMatterStatus(status: string | null | undefined): string {
  const normalized = sanitize(status).toLowerCase();
  if (normalized === "closed") return "Closed";
  if (normalized === "pending") return "Pending";
  return "Open";
}

function sortCasesForExport<T extends { id: string; createdAt: Date }>(
  cases: T[],
  options: ClioExportOptions
): T[] {
  if (!options.preserveCaseOrder || options.caseIds == null || options.caseIds.length === 0) {
    return cases;
  }

  const requestedOrder = new Map(options.caseIds.map((caseId, index) => [caseId, index]));
  return [...cases].sort((a, b) => {
    const aIndex = requestedOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = requestedOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function renderClioContactsCsv(rows: ClioContactRow[]): string {
  const header = csvRow([...CLIO_CONTACT_HEADERS]);
  const body = rows.map((row) =>
    csvRow([row.first_name, row.last_name, row.company, row.primary_phone, row.email_address])
  );
  return header + body.join("");
}

export function renderClioMattersCsv(rows: ClioMatterRow[]): string {
  const header = csvRow([...CLIO_MATTER_HEADERS]);
  const body = rows.map((row) =>
    csvRow([
      row.description,
      row.custom_number,
      row.status,
      row.client_first_name,
      row.client_last_name,
      row.client_company_name,
    ])
  );
  return header + body.join("");
}

export async function listClioContactRows(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<ClioContactRow[]> {
  const where = {
    firmId,
    ...(options.caseIds != null && options.caseIds.length > 0
      ? { id: { in: options.caseIds } }
      : {}),
  };
  const cases = await prisma.legalCase.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      clientName: true,
      clientContactId: true,
      clientContact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          phone: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const orderedCases = sortCasesForExport(cases, options);

  const seen = new Set<string>();
  const contacts: ClioContactRow[] = [];

  for (const c of orderedCases) {
    const contact = c.clientContact;
    const name = sanitize(contact?.fullName ?? c.clientName);
    if (!name) continue;
    const key = contact?.id ?? name.toLowerCase();
    // Batch exports intentionally dedupe repeat clients by persisted contact id when possible,
    // then fall back to normalized client name so Clio contact imports stay safer across matters.
    if (seen.has(key)) continue;
    seen.add(key);

    const firstName = sanitize(contact?.firstName);
    const lastName = sanitize(contact?.lastName);
    const derived = !firstName && !lastName ? splitClientName(name) : null;
    const company = derived?.company ?? "";
    const exportFirstName = firstName || derived?.firstName || "";
    const exportLastName = lastName || derived?.lastName || "";
    if (exportFirstName || exportLastName || company) {
      contacts.push({
        first_name: exportFirstName,
        last_name: exportLastName,
        company: company,
        primary_phone: sanitize(contact?.phone),
        email_address: sanitize(contact?.email),
      });
    }
  }

  return contacts;
}

export async function generateClioContactsCsv(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<string> {
  const contacts = await listClioContactRows(firmId, options);
  return renderClioContactsCsv(contacts);
}

export async function listClioMatterRows(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<ClioMatterRow[]> {
  const where = {
    firmId,
    ...(options.caseIds != null && options.caseIds.length > 0
      ? { id: { in: options.caseIds } }
      : {}),
  };
  const cases = await prisma.legalCase.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      title: true,
      caseNumber: true,
      clientName: true,
      status: true,
      clientContact: {
        select: {
          firstName: true,
          lastName: true,
          fullName: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const orderedCases = sortCasesForExport(cases, options);

  return orderedCases.map((c) => {
    const desc = sanitize(c.title) || `Case ${c.id}`;
    const displayNum = sanitize(c.caseNumber) || c.id;
    const status = formatMatterStatus(c.status);
    const contact = c.clientContact;
    const fallback = splitClientName(contact?.fullName ?? c.clientName ?? "");
    const firstName = sanitize(contact?.firstName) || fallback.firstName;
    const lastName = sanitize(contact?.lastName) || fallback.lastName;
    const company = fallback.company;
    return {
      description: desc,
      custom_number: displayNum,
      status,
      client_first_name: firstName,
      client_last_name: lastName,
      client_company_name: company,
    };
  });
}

export async function generateClioMattersCsv(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<string> {
  const matters = await listClioMatterRows(firmId, options);
  return renderClioMattersCsv(matters);
}
