/**
 * Smart file renaming engine: standardize document filenames from extracted context.
 * Used post-classification in the pipeline. Safe filenames, collision handling, fallback when metadata is incomplete.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { getObjectBuffer, putObject, deleteObject, objectExists } from "./storage";
import { buildDocumentStorageKey, buildDocumentStoragePrefix } from "./documentStorageKeys";
import { logWarn } from "../lib/logger";

const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const MAX_BASE_NAME_LENGTH = 120;
const MAX_SEGMENT_LENGTH = 40;
const FALLBACK_PROVIDER = "Unknown";
const FALLBACK_DOC_TYPE = "Document";
const UNVERIFIED_LABEL = "Unverified";

export type SmartRenameContext = {
  documentType: string;
  providerName: string | null;
  serviceDate: string | null;
  uploadDate: string;
  clientName?: string | null;
  /** Include client name in filename only when true (e.g. from firm rules) */
  includeClientName?: boolean;
};

/**
 * Sanitize a segment for use in filenames. Strips illegal chars, collapses spaces, limits length.
 */
export function sanitizeSegment(s: string, maxLen = MAX_SEGMENT_LENGTH): string {
  if (!s || typeof s !== "string") return "";
  const t = s
    .replace(ILLEGAL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, maxLen);
}

/**
 * Humanize doc_type for display in filename (e.g. medical_record -> Medical Record).
 */
function humanizeDocType(docType: string): string {
  const t = (docType || "").trim();
  if (!t) return FALLBACK_DOC_TYPE;
  return t
    .split(/[_\s-]+/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, MAX_SEGMENT_LENGTH);
}

/**
 * Format a date for filename: YYYY-MM-DD. Accepts ISO string or partial.
 */
function formatDateForFilename(dateStr: string | null): string {
  if (!dateStr || typeof dateStr !== "string") return "";
  const d = new Date(dateStr.trim());
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Build primary filename base (no extension): [DocumentType]_[Provider]_[Date].
 * Uses fallback segments when missing; if no usable date uses uploadDate.
 */
export function buildSmartFileNameBase(ctx: SmartRenameContext): string {
  const docType = humanizeDocType(ctx.documentType || FALLBACK_DOC_TYPE);
  const provider = sanitizeSegment(ctx.providerName || FALLBACK_PROVIDER);
  const date =
    formatDateForFilename(ctx.serviceDate) ||
    formatDateForFilename(ctx.uploadDate) ||
    formatDateForFilename(new Date().toISOString());
  const parts = [docType, provider, date].filter(Boolean);
  const base = parts.join("_");
  return sanitizeSegment(base, MAX_BASE_NAME_LENGTH) || FALLBACK_DOC_TYPE;
}

/**
 * Build fallback filename base when metadata is incomplete: [DocumentType]_Unverified_[UploadDate].
 */
export function buildFallbackFileNameBase(ctx: Pick<SmartRenameContext, "documentType" | "uploadDate">): string {
  const docType = humanizeDocType(ctx.documentType || FALLBACK_DOC_TYPE);
  const date = formatDateForFilename(ctx.uploadDate) || formatDateForFilename(new Date().toISOString());
  const base = `${docType}_${UNVERIFIED_LABEL}_${date}`;
  return sanitizeSegment(base, MAX_BASE_NAME_LENGTH) || FALLBACK_DOC_TYPE;
}

/**
 * Get extension from filename or mimeType. Preserves original extension when possible.
 */
export function getExtension(originalName: string | null, mimeType?: string | null): string {
  if (originalName && typeof originalName === "string") {
    const ext = originalName.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]+$/.test(ext) && ext.length <= 6) return ext;
  }
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType?.startsWith("image/")) return mimeType.split("/")[1]?.split("+")[0] || "jpg";
  return "pdf";
}

/**
 * Resolve collision by appending _1, _2, ... until key does not exist.
 */
async function resolveCollision(
  firmId: string,
  baseName: string,
  ext: string,
  keyPrefix: string
): Promise<string> {
  const fullBase = `${baseName}.${ext}`;
  let candidate = fullBase;
  let n = 0;
  while (await objectExists(`${keyPrefix}/${candidate}`)) {
    n += 1;
    candidate = `${baseName}_${n}.${ext}`;
    if (candidate.length > 200) {
      candidate = `${baseName.slice(0, 200 - 6 - String(n).length)}_${n}.${ext}`;
    }
  }
  return candidate;
}

export type RenameResult =
  | { ok: true; newSpacesKey: string; newOriginalName: string }
  | { ok: false; error: string };

/**
 * Rename document in storage and update document record. Uses classification/recognition context.
 * Call post-classification when doc_type and provider/date are available.
 * Does not break references: updates document.spacesKey and document.originalName atomically after copy.
 */
export async function renameDocumentInStorage(documentId: string, firmId: string): Promise<RenameResult> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { spacesKey: true, originalName: true, mimeType: true, ingestedAt: true, duplicateOfId: true, routedCaseId: true },
  });
  if (!doc?.spacesKey) return { ok: false, error: "Document or spacesKey missing" };
  if (doc.duplicateOfId) return { ok: true, newSpacesKey: doc.spacesKey, newOriginalName: doc.originalName ?? "" };

  const { rows } = await pgPool.query<{
    doc_type: string | null;
    provider_name: string | null;
    incident_date: string | null;
    insurance_fields: unknown;
  }>(
    `select doc_type, provider_name, incident_date, insurance_fields from document_recognition where document_id = $1`,
    [documentId]
  );
  const rec = rows[0];

  const uploadDate: string = doc.ingestedAt?.toISOString?.() ?? new Date().toISOString() ?? "";
  const serviceDateRaw =
    rec?.incident_date ??
    (rec?.insurance_fields != null && typeof rec.insurance_fields === "object"
      ? (rec.insurance_fields as { serviceDate?: string; dateOfService?: string }).serviceDate ??
        (rec.insurance_fields as { serviceDate?: string; dateOfService?: string }).dateOfService
      : null);

  const ctx: SmartRenameContext = {
    documentType: (rec?.doc_type ?? "other") as string,
    providerName: (rec?.provider_name ?? null) as string | null,
    serviceDate: serviceDateRaw ?? null,
    uploadDate,
  };

  const hasUsefulMetadata =
    (rec?.doc_type && rec.doc_type !== "other") ||
    (rec?.provider_name && rec.provider_name.trim().length > 0) ||
    (serviceDateRaw && formatDateForFilename(serviceDateRaw));

  const baseName = hasUsefulMetadata ? buildSmartFileNameBase(ctx) : buildFallbackFileNameBase(ctx);
  const ext = getExtension(doc.originalName, doc.mimeType);
  const keyPrefix = buildDocumentStoragePrefix({
    firmId,
    caseId: doc.routedCaseId ?? null,
    documentId,
  });

  const fileName = await resolveCollision(firmId, baseName, ext, keyPrefix);
  const newSpacesKey = buildDocumentStorageKey({
    firmId,
    caseId: doc.routedCaseId ?? null,
    documentId,
    originalName: fileName,
  });

  if (newSpacesKey === doc.spacesKey) {
    const name: string = (doc.originalName ?? fileName ?? "").toString();
    const key: string = (doc.spacesKey ?? "").toString();
    return { ok: true, newSpacesKey: key, newOriginalName: name };
  }

  try {
    const buf = await getObjectBuffer(doc.spacesKey);
    const contentType = doc.mimeType || "application/octet-stream";
    await putObject(newSpacesKey, buf, contentType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to copy to new key: ${msg}` };
  }

  try {
    await prisma.document.update({
      where: { id: documentId, firmId },
      data: { spacesKey: newSpacesKey, originalName: fileName },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await deleteObject(newSpacesKey).catch(() => {});
    return { ok: false, error: `Failed to update document: ${msg}` };
  }

  try {
    await deleteObject(doc.spacesKey);
  } catch (e) {
    logWarn("smart_rename_old_key_delete_failed", {
      documentId,
      firmId,
      oldKey: doc.spacesKey,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { ok: true, newSpacesKey, newOriginalName: fileName };
}
