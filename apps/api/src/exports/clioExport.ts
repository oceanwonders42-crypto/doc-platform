/**
 * Clio CSV export: contacts and matters from LegalCase data.
 * Maps LegalCase.clientName -> Contact (first_name, last_name or company)
 * Maps LegalCase -> Matter (caseNumber->display number, title->description)
 */
import { prisma } from "../db/prisma";
import { csvRow, toValidUtf8 } from "./csvEscape";

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

export async function generateClioContactsCsv(firmId: string): Promise<string> {
  const cases = await prisma.legalCase.findMany({
    where: { firmId },
    select: { clientName: true },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Set<string>();
  const contacts: { first_name: string; last_name: string; company: string }[] = [];

  for (const c of cases) {
    const name = sanitize(c.clientName);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const { firstName, lastName, company } = splitClientName(name);
    if (lastName || firstName || company) {
      contacts.push({
        first_name: firstName,
        last_name: lastName,
        company: company,
      });
    }
  }

  const header = csvRow(["first_name", "last_name", "company", "primary_phone", "email_address"]);
  const rows = contacts.map((r) =>
    csvRow([r.first_name, r.last_name, r.company, "", ""])
  );
  return header + rows.join("");
}

export async function generateClioMattersCsv(firmId: string): Promise<string> {
  const cases = await prisma.legalCase.findMany({
    where: { firmId },
    select: { id: true, title: true, caseNumber: true, clientName: true },
    orderBy: { createdAt: "asc" },
  });

  const header = csvRow([
    "description",
    "custom_number",
    "status",
    "client_first_name",
    "client_last_name",
    "client_company_name",
  ]);

  const rows = cases.map((c) => {
    const desc = sanitize(c.title) || `Case ${c.id}`;
    const displayNum = sanitize(c.caseNumber) || c.id;
    const status = "Open";
    const { firstName, lastName, company } = splitClientName(c.clientName ?? "");
    return csvRow([desc, displayNum, status, firstName, lastName, company]);
  });

  return header + rows.join("");
}
