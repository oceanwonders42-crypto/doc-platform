/**
 * Folder and file naming rules for paperless export.
 * Firm-level rules stored in Firm.settings.exportNaming.
 * Safe fallbacks when extracted fields are missing; compatible with CRM, cloud, and download flows.
 */

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";

const FALLBACK = "Unknown";
const MAX_FILE_NAME_LENGTH = 200;
const MAX_PATH_SEGMENT_LENGTH = 100;

export type ExportNamingRules = {
  /** Pattern for file names. Placeholders: {caseNumber}, {clientName}, {caseTitle}, {documentType}, {providerName}, {serviceDate}, {originalName}, {date} */
  filePattern?: string | null;
  /** Pattern for folder path (case-level or per-doc). Same placeholders. */
  folderPattern?: string | null;
  /** Map document type -> folder name. E.g. { "Medical Records": "Medical", "EOB": "EOB" }. Use "default" for fallback. */
  folderByDocType?: Record<string, string> | null;
};

export type NamingContext = {
  caseNumber: string;
  clientName: string;
  caseTitle: string;
  documentType: string;
  providerName: string;
  serviceDate: string;
  originalName: string;
  date: string; // export date YYYY-MM-DD
};

const PLACEHOLDERS: (keyof NamingContext)[] = [
  "caseNumber",
  "clientName",
  "caseTitle",
  "documentType",
  "providerName",
  "serviceDate",
  "originalName",
  "date",
];

function sanitizeForFileName(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH) || FALLBACK;
}

function sanitizeForPathSegment(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PATH_SEGMENT_LENGTH) || FALLBACK;
}

/** Replace placeholders in a pattern. Missing values become FALLBACK. */
function replacePlaceholders(pattern: string, ctx: NamingContext, forPath: boolean): string {
  let out = pattern;
  for (const key of PLACEHOLDERS) {
    const value = ctx[key] ?? "";
    const safe = forPath ? sanitizeForPathSegment(value || FALLBACK) : sanitizeForFileName(value || FALLBACK);
    out = out.replace(new RegExp(`\\{${key}\\}`, "gi"), safe);
  }
  return out;
}

/**
 * Get firm export naming rules from Firm.settings.exportNaming.
 */
export async function getFirmExportNamingRules(firmId: string): Promise<ExportNamingRules | null> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  const exportNaming = settings.exportNaming;
  if (!exportNaming || typeof exportNaming !== "object") return null;
  const r = exportNaming as Record<string, unknown>;
  return {
    filePattern: typeof r.filePattern === "string" ? r.filePattern : null,
    folderPattern: typeof r.folderPattern === "string" ? r.folderPattern : null,
    folderByDocType:
      r.folderByDocType != null && typeof r.folderByDocType === "object" && !Array.isArray(r.folderByDocType)
        ? (r.folderByDocType as Record<string, string>)
        : null,
  };
}

/**
 * Apply file naming pattern. Returns a safe file name (no extension). Caller adds extension if needed.
 */
export function applyFilePattern(rules: ExportNamingRules | null, ctx: NamingContext): string {
  const pattern = rules?.filePattern?.trim();
  if (!pattern) return sanitizeForFileName(ctx.originalName || ctx.documentType || "document");
  const name = replacePlaceholders(pattern, ctx, false);
  return sanitizeForFileName(name) || "document";
}

/**
 * Apply folder path pattern. Returns path segments joined by / (safe for ZIP and S3).
 */
export function applyFolderPattern(rules: ExportNamingRules | null, ctx: NamingContext): string {
  const pattern = rules?.folderPattern?.trim();
  if (!pattern) return "";
  const path = replacePlaceholders(pattern, ctx, true);
  return path
    .split(/[/\\]+/g)
    .map((s) => sanitizeForPathSegment(s.trim()))
    .filter(Boolean)
    .join("/");
}

/**
 * Get folder name for a document type from folderByDocType map. Uses "default" if doc type not found.
 */
export function getFolderForDocType(rules: ExportNamingRules | null, documentType: string): string {
  if (!rules?.folderByDocType || typeof rules.folderByDocType !== "object") return "";
  const normalized = (documentType || "").trim() || FALLBACK;
  const folder =
    rules.folderByDocType[normalized] ??
    rules.folderByDocType["default"] ??
    "";
  return sanitizeForPathSegment(folder);
}

/**
 * Build naming context for one document from case + doc + recognition row.
 * Optionally pass growthPrimaryServiceDate (from extractedFields.growthExtraction.serviceDates) for better date when recognition has none.
 */
export function buildDocumentNamingContext(
  caseData: { caseNumber: string | null; clientName: string | null; title: string | null },
  doc: { id: string; originalName: string | null },
  recognition: {
    doc_type?: string | null;
    provider_name?: string | null;
    incident_date?: string | null;
    insurance_fields?: { serviceDate?: string; dateOfService?: string } | null;
  } | null,
  exportedAtIso: string,
  growthPrimaryServiceDate?: string | null
): NamingContext {
  const serviceDateRaw =
    recognition?.insurance_fields?.serviceDate ??
    recognition?.insurance_fields?.dateOfService ??
    recognition?.incident_date ??
    growthPrimaryServiceDate;
  let serviceDate = "";
  if (serviceDateRaw) {
    const d = new Date(serviceDateRaw as string);
    serviceDate = isNaN(d.getTime()) ? String(serviceDateRaw) : d.toISOString().slice(0, 10);
  }
  const date = exportedAtIso.slice(0, 10);

  return {
    caseNumber: (caseData.caseNumber ?? "").trim() || FALLBACK,
    clientName: (caseData.clientName ?? "").trim() || FALLBACK,
    caseTitle: (caseData.title ?? "").trim() || FALLBACK,
    documentType: (recognition?.doc_type ?? "").toString().trim() || FALLBACK,
    providerName: (recognition?.provider_name ?? "").toString().trim() || FALLBACK,
    serviceDate: serviceDate || FALLBACK,
    originalName: (doc.originalName ?? doc.id).trim() || "document",
    date,
  };
}

/**
 * Fetch recognition row for a document from document_recognition.
 */
export async function getRecognitionForDocument(documentId: string): Promise<{
  doc_type?: string | null;
  provider_name?: string | null;
  incident_date?: string | null;
  insurance_fields?: { serviceDate?: string; dateOfService?: string } | null;
} | null> {
  const { rows } = await pgPool.query<{
    doc_type: string | null;
    provider_name: string | null;
    incident_date: string | null;
    insurance_fields: unknown;
  }>(
    `select doc_type, provider_name, incident_date, insurance_fields from document_recognition where document_id = $1`,
    [documentId]
  );
  const r = rows[0];
  if (!r) return null;
  const ins = r.insurance_fields;
  const insuranceFields =
    ins != null && typeof ins === "object"
      ? (ins as { serviceDate?: string; dateOfService?: string })
      : undefined;
  return {
    doc_type: r.doc_type,
    provider_name: r.provider_name,
    incident_date: r.incident_date,
    insurance_fields: insuranceFields,
  };
}

/**
 * Persist firm export naming rules into Firm.settings.exportNaming.
 */
export async function setFirmExportNamingRules(
  firmId: string,
  rules: Partial<ExportNamingRules>
): Promise<ExportNamingRules> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  const existing = (settings.exportNaming ?? {}) as Record<string, unknown>;
  const updated: ExportNamingRules = {
    filePattern: rules.filePattern !== undefined ? (rules.filePattern ?? null) : (existing.filePattern as string | null),
    folderPattern: rules.folderPattern !== undefined ? (rules.folderPattern ?? null) : (existing.folderPattern as string | null),
    folderByDocType:
      rules.folderByDocType !== undefined
        ? (rules.folderByDocType ?? null)
        : (existing.folderByDocType as Record<string, string> | null),
  };
  await prisma.firm.update({
    where: { id: firmId },
    data: { settings: { ...settings, exportNaming: updated } as object },
  });
  return updated;
}
