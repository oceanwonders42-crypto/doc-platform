/**
 * Parse CSV and match rows to LegalCase by caseNumber or title.
 * Creates/updates CrmCaseMapping.
 */
import { prisma } from "../db/prisma";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (values[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

export type ImportRowResult = {
  caseNumber: string;
  externalMatterId: string;
  status: "created" | "updated" | "not_found";
  caseId?: string;
  caseTitle?: string;
};

export type ImportResult = {
  ok: boolean;
  created: number;
  updated: number;
  notFound: number;
  rows: ImportRowResult[];
};

export async function importClioMappingsFromCsv(
  firmId: string,
  csvContent: string | Buffer
): Promise<ImportResult> {
  const csv = Buffer.isBuffer(csvContent) ? csvContent.toString("utf-8") : csvContent;
  const { headers, rows } = parseCsv(csv);

  const caseNumberIdx = headers.findIndex((h) => h === "casenumber" || h === "case_number");
  const externalIdx = headers.findIndex((h) => h === "externalmatterid" || h === "external_matter_id");
  if (caseNumberIdx < 0 || externalIdx < 0) {
    throw new Error(
      "CSV must have columns: caseNumber, externalMatterId (headers are case-insensitive)"
    );
  }

  const caseNumberKey = headers[caseNumberIdx];
  const externalKey = headers[externalIdx];

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let notFound = 0;

  const cases = await prisma.legalCase.findMany({
    where: { firmId },
    select: { id: true, caseNumber: true, title: true },
  });

  const byCaseNumber = new Map<string | null, (typeof cases)[0]>();
  const byTitle = new Map<string | null, (typeof cases)[0]>();
  for (const c of cases) {
    const cn = c.caseNumber?.trim() || null;
    const t = c.title?.trim() || null;
    if (cn) byCaseNumber.set(cn, c);
    if (t) byTitle.set(t, c);
  }

  for (const row of rows) {
    const caseNumberRaw = row[caseNumberKey] ?? "";
    const externalMatterId = row[externalKey] ?? "";
    if (!externalMatterId) continue;

    const caseNumber = caseNumberRaw.trim();
    let matched = caseNumber ? byCaseNumber.get(caseNumber) : null;
    if (!matched && caseNumber) {
      matched = byTitle.get(caseNumber) ?? null;
    }

    if (!matched) {
      results.push({
        caseNumber: caseNumber || "(empty)",
        externalMatterId,
        status: "not_found",
      });
      notFound++;
      continue;
    }

    const existing = await prisma.crmCaseMapping.findUnique({
      where: { firmId_caseId: { firmId, caseId: matched.id } },
    });

    await prisma.crmCaseMapping.upsert({
      where: { firmId_caseId: { firmId, caseId: matched.id } },
      create: { firmId, caseId: matched.id, externalMatterId },
      update: { externalMatterId },
    });

    const wasNew = !existing;
    if (wasNew) created++;
    else updated++;

    results.push({
      caseNumber: matched.caseNumber ?? matched.title ?? matched.id,
      externalMatterId,
      status: wasNew ? "created" : "updated",
      caseId: matched.id,
      caseTitle: matched.title ?? undefined,
    });
  }

  return { ok: true, created, updated, notFound, rows: results };
}
