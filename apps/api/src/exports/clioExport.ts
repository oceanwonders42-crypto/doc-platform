/**
 * Clio CSV export: contacts and matters from LegalCase data.
 * Prefers persisted case client contacts when present and falls back to LegalCase.clientName.
 */
import { prisma } from "../db/prisma";
import { csvRow, toValidUtf8 } from "./csvEscape";

type ClioExportOptions = {
  caseIds?: string[];
};

type ClioContactRow = {
  first_name: string;
  last_name: string;
  company: string;
  primary_phone: string;
  email_address: string;
};

type ClioMatterRow = {
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

  const seen = new Set<string>();
  const contacts: ClioContactRow[] = [];

  for (const c of cases) {
    const contact = c.clientContact;
    const name = sanitize(contact?.fullName ?? c.clientName);
    if (!name) continue;
    const key = contact?.id ?? name.toLowerCase();
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
  const header = csvRow(["first_name", "last_name", "company", "primary_phone", "email_address"]);
  const rows = contacts.map((r) =>
    csvRow([r.first_name, r.last_name, r.company, r.primary_phone, r.email_address])
  );
  return header + rows.join("");
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

  return cases.map((c) => {
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
  const header = csvRow([
    "description",
    "custom_number",
    "status",
    "client_first_name",
    "client_last_name",
    "client_company_name",
  ]);

  const rows = matters.map((r) =>
    csvRow([
      r.description,
      r.custom_number,
      r.status,
      r.client_first_name,
      r.client_last_name,
      r.client_company_name,
    ])
  );
  return header + rows.join("");
}
