const STORAGE_SEGMENT_FALLBACK = "unknown";
export const UNROUTED_CASE_STORAGE_SEGMENT = "_unrouted";

function sanitizeSegment(value: string | null | undefined, fallback = STORAGE_SEGMENT_FALLBACK): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const sanitized = trimmed.replace(/[\\/:\x00-\x1f]+/g, "-").replace(/\s+/g, "-");
  return sanitized.length > 0 ? sanitized : fallback;
}

function sanitizeFileName(originalName: string | null | undefined, documentId: string): string {
  const base = typeof originalName === "string" ? originalName.trim() : "";
  const sanitized = base
    .replace(/[\\/:\x00-\x1f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (sanitized.length > 0) {
    return sanitized;
  }

  return `document-${sanitizeSegment(documentId, "file")}.bin`;
}

export function buildDocumentStorageKey(params: {
  firmId: string;
  caseId?: string | null;
  documentId: string;
  originalName?: string | null;
}): string {
  return `${buildDocumentStoragePrefix(params)}/${sanitizeFileName(params.originalName, params.documentId)}`;
}

export function buildDocumentStoragePrefix(params: {
  firmId: string;
  caseId?: string | null;
  documentId: string;
}): string {
  const firmSegment = sanitizeSegment(params.firmId);
  const caseSegment = sanitizeSegment(params.caseId, UNROUTED_CASE_STORAGE_SEGMENT);
  const documentSegment = sanitizeSegment(params.documentId);

  return `${firmSegment}/${caseSegment}/${documentSegment}`;
}
