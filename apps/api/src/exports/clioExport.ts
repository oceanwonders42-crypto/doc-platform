/**
 * Clio CSV export: contacts and matters from LegalCase data.
 * Prefers persisted case client contacts when present and falls back to LegalCase.clientName.
 */
import ExcelJS from "exceljs";
import { prisma } from "../db/prisma";
import { csvRow, toValidUtf8 } from "./csvEscape";

type ClioExportOptions = {
  caseIds?: string[];
  preserveCaseOrder?: boolean;
};

export const CLIO_CONTACT_HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Address",
  "Company",
] as const;

export const CLIO_MATTER_HEADERS = [
  "Matter Name",
  "Client",
  "Matter Number",
  "Description",
  "Practice Area",
  "Status",
] as const;

export type ClioContactRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  company: string;
  clientLabel: string;
};

export type ClioMatterRow = {
  matterName: string;
  client: string;
  matterNumber: string;
  description: string;
  practiceArea: string;
  status: string;
};

type ClioExportCaseRecord = {
  id: string;
  createdAt: Date;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
  status: string | null;
  notes: string | null;
  clientContact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  } | null;
};

type NormalizedClioClient = {
  dedupeKey: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  company: string;
  displayLabel: string;
};

type ClioExportRows = {
  contacts: ClioContactRow[];
  matters: ClioMatterRow[];
};

type ClioColumnDefinition<Row> = {
  header: string;
  width: number;
  value: (row: Row) => string;
};

const COMPANY_NAME_PATTERN =
  /\b(llc|l\.l\.c\.|inc|corp|corporation|co\.|company|pllc|p\.l\.l\.c\.|llp|l\.l\.p\.|ltd|hospital|clinic|center|centre|group|services|associates|association|insurance|bank|university|school|department|medical|health)\b/i;

const CLIO_CONTACT_COLUMNS: ReadonlyArray<ClioColumnDefinition<ClioContactRow>> = [
  { header: "First Name", width: 18, value: (row) => row.firstName },
  { header: "Last Name", width: 18, value: (row) => row.lastName },
  { header: "Email", width: 28, value: (row) => row.email },
  { header: "Phone", width: 18, value: (row) => row.phone },
  { header: "Address", width: 36, value: (row) => row.address },
  { header: "Company", width: 24, value: (row) => row.company },
];

const CLIO_MATTER_COLUMNS: ReadonlyArray<ClioColumnDefinition<ClioMatterRow>> = [
  { header: "Matter Name", width: 32, value: (row) => row.matterName },
  { header: "Client", width: 24, value: (row) => row.client },
  { header: "Matter Number", width: 20, value: (row) => row.matterNumber },
  { header: "Description", width: 42, value: (row) => row.description },
  { header: "Practice Area", width: 18, value: (row) => row.practiceArea },
  { header: "Status", width: 12, value: (row) => row.status },
];

function sanitize(s: string | null | undefined): string {
  if (!s || typeof s !== "string") return "";
  return toValidUtf8(s.trim());
}

function splitClientName(name: string): { firstName: string; lastName: string; company: string } {
  const t = sanitize(name);
  if (!t) return { firstName: "", lastName: "", company: "" };
  if (COMPANY_NAME_PATTERN.test(t)) {
    return { firstName: "", lastName: "", company: t };
  }
  const commaParts = t.split(",").map((part) => sanitize(part)).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      firstName: commaParts.slice(1).join(" "),
      lastName: commaParts[0],
      company: "",
    };
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "", company: "" };
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "", company: "" };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName, company: "" };
}

function normalizeEmail(value: string | null | undefined): string {
  const email = sanitize(value).toLowerCase();
  return email.includes("@") ? email : "";
}

function normalizePhone(value: string | null | undefined): string {
  const raw = sanitize(value);
  if (!raw) return "";

  const digits = raw.replace(/\D+/g, "");
  if (!digits) return "";

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return raw.replace(/\s+/g, " ");
}

function formatAddress(contact: ClioExportCaseRecord["clientContact"]): string {
  if (!contact) return "";

  const street = [sanitize(contact.address1), sanitize(contact.address2)].filter(Boolean).join(", ");
  const city = sanitize(contact.city);
  const state = sanitize(contact.state);
  const postalCode = sanitize(contact.postalCode);
  const locality = [city, state].filter(Boolean).join(", ");
  const localityWithPostal = [locality, postalCode].filter(Boolean).join(" ").trim();

  return [street, localityWithPostal].filter(Boolean).join(", ");
}

function buildClientLabel(
  value: Pick<NormalizedClioClient, "firstName" | "lastName" | "company">,
  fallback = ""
): string {
  const fullName = [sanitize(value.firstName), sanitize(value.lastName)].filter(Boolean).join(" ");
  return fullName || sanitize(value.company) || fallback;
}

function buildMissingClientLabel(item: Pick<ClioExportCaseRecord, "id" | "caseNumber">): string {
  const ref = sanitize(item.caseNumber) || item.id;
  return `Unknown Client ${ref}`;
}

function buildContactCandidate(item: ClioExportCaseRecord): NormalizedClioClient {
  const contact = item.clientContact;
  const baseName = sanitize(contact?.fullName ?? item.clientName);
  const explicitFirstName = sanitize(contact?.firstName);
  const explicitLastName = sanitize(contact?.lastName);
  const derived = !explicitFirstName && !explicitLastName ? splitClientName(baseName) : null;

  let firstName = explicitFirstName || derived?.firstName || "";
  let lastName = explicitLastName || derived?.lastName || "";
  let company = derived?.company || "";

  if (!firstName && !lastName && !company) {
    firstName = "Unknown";
    lastName = `Client ${sanitize(item.caseNumber) || item.id}`;
  }

  const email = normalizeEmail(contact?.email);
  const phone = normalizePhone(contact?.phone);
  const address = formatAddress(contact);
  const displayLabel = buildClientLabel({ firstName, lastName, company }, buildMissingClientLabel(item));
  const dedupeKey = email
    ? `email:${email}`
    : company
      ? `company:${company.toLowerCase()}`
      : `name:${displayLabel.toLowerCase()}`;

  return {
    dedupeKey,
    firstName,
    lastName,
    email,
    phone,
    address,
    company,
    displayLabel,
  };
}

function mergeClientRecord(existing: NormalizedClioClient, incoming: NormalizedClioClient): NormalizedClioClient {
  existing.firstName ||= incoming.firstName;
  existing.lastName ||= incoming.lastName;
  existing.email ||= incoming.email;
  existing.phone ||= incoming.phone;
  existing.address ||= incoming.address;
  existing.company ||= incoming.company;
  existing.displayLabel = buildClientLabel(existing, existing.displayLabel || incoming.displayLabel);
  return existing;
}

function formatMatterStatus(status: string | null | undefined): string {
  const normalized = sanitize(status).toLowerCase();
  if (normalized === "closed") return "Closed";
  return "Open";
}

function valuesFromColumns<Row>(columns: ReadonlyArray<ClioColumnDefinition<Row>>, row: Row): string[] {
  return columns.map((column) => sanitize(column.value(row)));
}

async function renderClioWorkbook<Row>(
  sheetName: string,
  columns: ReadonlyArray<ClioColumnDefinition<Row>>,
  rows: Row[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Onyx Intel";
  workbook.created = new Date();
  workbook.modified = workbook.created;

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.header,
    width: column.width,
    style: { alignment: { vertical: "top", wrapText: true } },
  }));
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };

  for (const row of rows) {
    worksheet.addRow(valuesFromColumns(columns, row));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
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

async function listClioExportCases(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<ClioExportCaseRecord[]> {
  const where = {
    firmId,
    ...(options.caseIds != null && options.caseIds.length > 0 ? { id: { in: options.caseIds } } : {}),
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
      notes: true,
      clientContact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          email: true,
          phone: true,
          address1: true,
          address2: true,
          city: true,
          state: true,
          postalCode: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return sortCasesForExport(cases, options) as ClioExportCaseRecord[];
}

function buildClioExportRows(cases: ClioExportCaseRecord[]): ClioExportRows {
  const contactsByKey = new Map<string, NormalizedClioClient>();
  const orderedContacts: NormalizedClioClient[] = [];
  const contactByCaseId = new Map<string, NormalizedClioClient>();

  for (const item of cases) {
    const candidate = buildContactCandidate(item);
    const existing = contactsByKey.get(candidate.dedupeKey);
    const canonical = existing ? mergeClientRecord(existing, candidate) : candidate;
    if (!existing) {
      contactsByKey.set(candidate.dedupeKey, canonical);
      orderedContacts.push(canonical);
    }
    contactByCaseId.set(item.id, canonical);
  }

  const contacts = orderedContacts.map((contact) => ({
    firstName: sanitize(contact.firstName),
    lastName: sanitize(contact.lastName),
    email: sanitize(contact.email),
    phone: sanitize(contact.phone),
    address: sanitize(contact.address),
    company: sanitize(contact.company),
    clientLabel: sanitize(contact.displayLabel),
  }));

  const matters = cases.map((item) => {
    const client = contactByCaseId.get(item.id);
    const matterNumber = sanitize(item.caseNumber) || item.id;
    const matterName = sanitize(item.title) || `Case - ${matterNumber}`;
    const description = sanitize(item.notes) || matterName;
    return {
      matterName,
      client: sanitize(client?.displayLabel) || buildMissingClientLabel(item),
      matterNumber,
      description,
      practiceArea: "",
      status: formatMatterStatus(item.status),
    };
  });

  return { contacts, matters };
}

export function renderClioContactsCsv(rows: ClioContactRow[]): string {
  const header = csvRow([...CLIO_CONTACT_HEADERS]);
  const body = rows.map((row) => csvRow(valuesFromColumns(CLIO_CONTACT_COLUMNS, row)));
  return header + body.join("");
}

export function renderClioMattersCsv(rows: ClioMatterRow[]): string {
  const header = csvRow([...CLIO_MATTER_HEADERS]);
  const body = rows.map((row) => csvRow(valuesFromColumns(CLIO_MATTER_COLUMNS, row)));
  return header + body.join("");
}

export async function renderClioContactsXlsx(rows: ClioContactRow[]): Promise<Buffer> {
  return renderClioWorkbook("Contacts", CLIO_CONTACT_COLUMNS, rows);
}

export async function renderClioMattersXlsx(rows: ClioMatterRow[]): Promise<Buffer> {
  return renderClioWorkbook("Matters", CLIO_MATTER_COLUMNS, rows);
}

export async function listClioContactRows(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<ClioContactRow[]> {
  const cases = await listClioExportCases(firmId, options);
  return buildClioExportRows(cases).contacts;
}

export async function generateClioContactsCsv(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<string> {
  const contacts = await listClioContactRows(firmId, options);
  return renderClioContactsCsv(contacts);
}

export async function generateClioContactsXlsx(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<Buffer> {
  const contacts = await listClioContactRows(firmId, options);
  return renderClioContactsXlsx(contacts);
}

export async function listClioMatterRows(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<ClioMatterRow[]> {
  const cases = await listClioExportCases(firmId, options);
  return buildClioExportRows(cases).matters;
}

export async function generateClioMattersCsv(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<string> {
  const matters = await listClioMatterRows(firmId, options);
  return renderClioMattersCsv(matters);
}

export async function generateClioMattersXlsx(
  firmId: string,
  options: ClioExportOptions = {}
): Promise<Buffer> {
  const matters = await listClioMatterRows(firmId, options);
  return renderClioMattersXlsx(matters);
}
