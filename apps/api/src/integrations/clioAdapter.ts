/**
 * Clio Manage adapter: push documents and safe matter write-backs after routing.
 */
import { pgPool } from "../db/pg";
import { prisma } from "../db/prisma";
import { logWarn } from "../lib/logger";
import { logActivity } from "../services/activityFeed";
import { addDocumentAuditEvent } from "../services/audit";
import { getClioConfig } from "../services/clioConfig";

const CLIO_API_BASE = process.env.CLIO_API_BASE_URL || "https://app.clio.com/api/v4";
export const CLIO_CLAIM_NUMBER_MIN_CONFIDENCE = 0.85;

export type PushDocumentToClioParams = {
  firmId: string;
  caseId: string;
  documentId: string;
  fileName: string;
  fileUrl: string;
};

export type PushDocumentToClioResult =
  | { ok: true; clioDocumentId?: string }
  | { ok: false; error: string };

type ClioMatterApiContext =
  | {
      ok: true;
      accessToken: string;
      matterId: string;
      claimNumberCustomFieldId: string | null;
    }
  | { ok: false; error: string };

type ClioMatterCustomFieldValue = {
  id?: string | number;
  value?: unknown;
  custom_field?: {
    id?: string | number;
    name?: string | null;
  } | null;
};

type ClioMatterRecord = {
  id: string;
  customFieldValues: ClioMatterCustomFieldValue[];
};

type CreateClioMatterNoteResult =
  | { ok: true; noteId?: string }
  | { ok: false; error: string };

type FetchClioMatterResult =
  | { ok: true; matter: ClioMatterRecord }
  | { ok: false; error: string };

type PatchClioMatterClaimNumberResult =
  | { ok: true }
  | { ok: false; error: string };

type ClioWriteBackDocumentContext = {
  documentId: string;
  fileName: string;
  source: string | null;
  ingestedAt: Date | null;
  extractedFields: Record<string, unknown>;
  docType: string | null;
  confidence: number | null;
  insuranceFields: Record<string, unknown> | null;
};

export type ClioClaimNumberCandidate = {
  claimNumber: string;
  confidence: number;
};

export type ClioClaimNumberDecision =
  | { action: "skip_unconfigured" }
  | { action: "skip_no_candidate" }
  | { action: "skip_low_confidence" }
  | { action: "already_set"; claimNumber: string }
  | { action: "conflict"; claimNumber: string; currentValue: string }
  | { action: "update"; claimNumber: string };

type ClioClaimNumberCandidateAssessment =
  | { status: "candidate"; candidate: ClioClaimNumberCandidate }
  | { status: "skip_no_candidate" }
  | { status: "skip_low_confidence" };

export type SyncClioMatterWriteBackOnIngestParams = {
  firmId: string;
  caseId: string;
  documentId: string;
};

export type SyncClioMatterWriteBackOnIngestResult = {
  noteStatus: "added" | "failed" | "skipped";
  noteId?: string;
  noteError?: string;
  claimNumberStatus:
    | "updated"
    | "already_set"
    | "conflict"
    | "skipped_unconfigured"
    | "skipped_no_candidate"
    | "skipped_low_confidence"
    | "failed";
  claimNumber?: string | null;
  currentClaimNumber?: string | null;
  claimNumberError?: string;
};

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeClaimNumber(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  return normalized.replace(/\s+/g, "").toUpperCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toClioId(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function buildClioUrl(path: string): string {
  return `${CLIO_API_BASE.replace(/\/$/, "")}${path}`;
}

async function readClioError(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  return text ? text.slice(0, 500) : "No response body";
}

function buildClioHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function getClioMatterApiContext(firmId: string, caseId: string): Promise<ClioMatterApiContext> {
  const config = await getClioConfig(firmId);
  if (!config.configured) {
    const configError = "error" in config ? config.error : undefined;
    return { ok: false, error: configError ?? "Clio OAuth token not configured" };
  }

  const mapping = await prisma.crmCaseMapping.findUnique({
    where: { firmId_caseId: { firmId, caseId } },
    select: { externalMatterId: true },
  });
  const matterId = mapping?.externalMatterId?.trim();
  if (!matterId) {
    return { ok: false, error: "No Clio matter mapping for this case. Import mappings in Settings > CRM." };
  }

  return {
    ok: true,
    accessToken: config.accessToken,
    matterId,
    claimNumberCustomFieldId: config.claimNumberCustomFieldId,
  };
}

export function deriveClioClaimNumberCandidate(
  context: Pick<ClioWriteBackDocumentContext, "docType" | "confidence" | "extractedFields" | "insuranceFields">
): ClioClaimNumberCandidate | null {
  const assessment = assessClioClaimNumberCandidate(context);
  return assessment.status === "candidate" ? assessment.candidate : null;
}

function assessClioClaimNumberCandidate(
  context: Pick<ClioWriteBackDocumentContext, "docType" | "confidence" | "extractedFields" | "insuranceFields">
): ClioClaimNumberCandidateAssessment {
  const docType = normalizeString(context.docType);
  const extractedDocType = normalizeString(context.extractedFields.docType);
  const effectiveDocType = docType ?? extractedDocType;
  if (!effectiveDocType || !effectiveDocType.startsWith("insurance_")) {
    return { status: "skip_no_candidate" };
  }

  const confidence = toNumber(context.confidence);
  if (confidence == null || confidence < CLIO_CLAIM_NUMBER_MIN_CONFIDENCE) {
    return { status: "skip_low_confidence" };
  }

  const extractedClaimNumber = normalizeClaimNumber(context.extractedFields.claimNumber);
  const insuranceClaimNumber = normalizeClaimNumber(context.insuranceFields?.claimNumber);
  const candidates: string[] = [];
  if (extractedClaimNumber && !candidates.includes(extractedClaimNumber)) {
    candidates.push(extractedClaimNumber);
  }
  if (insuranceClaimNumber && !candidates.includes(insuranceClaimNumber)) {
    candidates.push(insuranceClaimNumber);
  }
  if (candidates.length !== 1) {
    return { status: "skip_no_candidate" };
  }

  return {
    status: "candidate",
    candidate: {
      claimNumber: candidates[0]!,
      confidence,
    },
  };
}

export function decideClioClaimNumberWriteBack(input: {
  claimNumberCustomFieldId: string | null;
  candidate: ClioClaimNumberCandidate | null;
  missingCandidateAction?: "skip_no_candidate" | "skip_low_confidence";
  currentFieldValue: string | null;
}): ClioClaimNumberDecision {
  if (!input.claimNumberCustomFieldId) {
    return { action: "skip_unconfigured" };
  }
  if (!input.candidate) {
    return { action: input.missingCandidateAction ?? "skip_no_candidate" };
  }

  const normalizedCurrentValue = normalizeClaimNumber(input.currentFieldValue);
  if (!normalizedCurrentValue) {
    return { action: "update", claimNumber: input.candidate.claimNumber };
  }
  if (normalizedCurrentValue === input.candidate.claimNumber) {
    return { action: "already_set", claimNumber: input.candidate.claimNumber };
  }
  return {
    action: "conflict",
    claimNumber: input.candidate.claimNumber,
    currentValue: normalizedCurrentValue,
  };
}

export function buildClioMatterNote(context: {
  fileName: string;
  documentId: string;
  source?: string | null;
  ingestedAt?: Date | null;
  docType?: string | null;
  claimNumberCandidate?: string | null;
}): {
  subject: string;
  detail: string;
  detail_text_type: "plain_text";
  date: string;
  type: "Matter";
} {
  const safeFileName = normalizeString(context.fileName) ?? context.documentId;
  const subject = `Onyx document ingested: ${safeFileName}`.slice(0, 200);
  const dateSource = context.ingestedAt ?? new Date();
  const lines = [
    "Document ingested by Onyx Intel.",
    `File: ${safeFileName}`,
    `Onyx document ID: ${context.documentId}`,
  ];
  const source = normalizeString(context.source);
  if (source) {
    lines.push(`Source: ${source}`);
  }
  const docType = normalizeString(context.docType);
  if (docType) {
    lines.push(`Detected type: ${docType}`);
  }
  const claimNumberCandidate = normalizeClaimNumber(context.claimNumberCandidate);
  if (claimNumberCandidate) {
    lines.push(`High-confidence claim number candidate: ${claimNumberCandidate}`);
  }
  lines.push(`Ingested at: ${dateSource.toISOString()}`);

  return {
    subject,
    detail: lines.join("\n").slice(0, 4000),
    detail_text_type: "plain_text",
    date: dateSource.toISOString().slice(0, 10),
    type: "Matter",
  };
}

function parseClioMatter(responseBody: unknown): ClioMatterRecord | null {
  const data = toObjectRecord(toObjectRecord(responseBody)?.data);
  const matterId = normalizeString(data?.id);
  if (!matterId) {
    return null;
  }
  const customFieldValues = Array.isArray(data?.custom_field_values)
    ? (data?.custom_field_values as ClioMatterCustomFieldValue[])
    : [];
  return {
    id: matterId,
    customFieldValues,
  };
}

function findClioCustomFieldValue(
  customFieldValues: ClioMatterCustomFieldValue[],
  customFieldId: string
): ClioMatterCustomFieldValue | null {
  return (
    customFieldValues.find((entry) => normalizeString(entry.custom_field?.id) === customFieldId) ?? null
  );
}

async function createClioMatterNote(params: {
  accessToken: string;
  matterId: string;
  note: ReturnType<typeof buildClioMatterNote>;
}): Promise<CreateClioMatterNoteResult> {
  const response = await fetch(buildClioUrl("/notes.json"), {
    method: "POST",
    headers: buildClioHeaders(params.accessToken),
    body: JSON.stringify({
      data: {
        subject: params.note.subject,
        detail: params.note.detail,
        detail_text_type: params.note.detail_text_type,
        date: params.note.date,
        type: params.note.type,
        matter: { id: toClioId(params.matterId) },
      },
    }),
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `Clio create note failed: ${response.status} ${await readClioError(response)}`,
    };
  }
  const responseBody = (await response.json()) as { data?: { id?: string | number } };
  return {
    ok: true,
    noteId: normalizeString(responseBody?.data?.id) ?? undefined,
  };
}

async function fetchClioMatter(params: {
  accessToken: string;
  matterId: string;
}): Promise<FetchClioMatterResult> {
  const response = await fetch(buildClioUrl(`/matters/${encodeURIComponent(params.matterId)}.json`), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `Clio fetch matter failed: ${response.status} ${await readClioError(response)}`,
    };
  }
  const responseBody = await response.json();
  const matter = parseClioMatter(responseBody);
  if (!matter) {
    return { ok: false, error: "Clio matter response missing data" };
  }
  return { ok: true, matter };
}

async function patchClioMatterClaimNumber(params: {
  accessToken: string;
  matterId: string;
  customFieldId: string;
  customFieldValueRowId?: string | number;
  claimNumber: string;
}): Promise<PatchClioMatterClaimNumberResult> {
  const response = await fetch(buildClioUrl(`/matters/${encodeURIComponent(params.matterId)}.json`), {
    method: "PATCH",
    headers: buildClioHeaders(params.accessToken),
    body: JSON.stringify({
      data: {
        custom_field_values: [
          {
            ...(params.customFieldValueRowId != null ? { id: params.customFieldValueRowId } : {}),
            custom_field: { id: toClioId(params.customFieldId) },
            value: params.claimNumber,
          },
        ],
      },
    }),
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `Clio patch matter failed: ${response.status} ${await readClioError(response)}`,
    };
  }
  return { ok: true };
}

async function loadClioWriteBackDocumentContext(
  firmId: string,
  documentId: string
): Promise<ClioWriteBackDocumentContext | null> {
  const [documentRow, recognitionResult] = await Promise.all([
    prisma.document.findFirst({
      where: { id: documentId, firmId },
      select: {
        id: true,
        originalName: true,
        source: true,
        ingestedAt: true,
        extractedFields: true,
        confidence: true,
      },
    }),
    pgPool.query<{
      doc_type: string | null;
      confidence: number | null;
      insurance_fields: unknown;
    }>(
      `
      select doc_type, confidence, insurance_fields
      from document_recognition
      where document_id = $1
      `,
      [documentId]
    ),
  ]);

  if (!documentRow) {
    return null;
  }

  const recognitionRow = recognitionResult.rows[0];
  const extractedFields = toObjectRecord(documentRow.extractedFields) ?? {};
  const insuranceFields = toObjectRecord(recognitionRow?.insurance_fields);
  return {
    documentId: documentRow.id,
    fileName: documentRow.originalName,
    source: documentRow.source,
    ingestedAt: documentRow.ingestedAt,
    extractedFields,
    docType: recognitionRow?.doc_type ?? normalizeString(extractedFields.docType),
    confidence: toNumber(documentRow.confidence) ?? toNumber(recognitionRow?.confidence),
    insuranceFields,
  };
}

async function auditClioWriteBackEvent(input: {
  firmId: string;
  caseId: string;
  documentId: string;
  action: string;
  metaJson: Record<string, unknown>;
}) {
  await addDocumentAuditEvent({
    firmId: input.firmId,
    documentId: input.documentId,
    actor: "system",
    action: input.action,
    fromCaseId: input.caseId,
    toCaseId: input.caseId,
    metaJson: input.metaJson,
  });
}

/**
 * Push a document to a Clio matter: create document record, upload file to put_url, mark complete.
 */
export async function pushDocumentToClio(params: PushDocumentToClioParams): Promise<PushDocumentToClioResult> {
  const { firmId, caseId, documentId, fileName, fileUrl } = params;
  const context = await getClioMatterApiContext(firmId, caseId);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const headers = buildClioHeaders(context.accessToken);

  const createRes = await fetch(buildClioUrl("/documents"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: fileName || documentId,
      parent: { id: context.matterId, type: "Matter" },
    }),
  });
  if (!createRes.ok) {
    return {
      ok: false,
      error: `Clio create document failed: ${createRes.status} ${await readClioError(createRes)}`,
    };
  }
  const createData = (await createRes.json()) as {
    data?: {
      id?: string;
      latest_document_version?: {
        put_url?: string;
        put_headers?: Record<string, string>;
      };
    };
  };
  const docId = createData?.data?.id;
  const version = createData?.data?.latest_document_version;
  const putUrl = version?.put_url;
  const putHeaders = version?.put_headers as Record<string, string> | undefined;

  if (!putUrl) {
    return { ok: false, error: "Clio did not return put_url for upload" };
  }

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    return { ok: false, error: `Failed to fetch file: ${fileRes.status}` };
  }
  const fileBuffer = await fileRes.arrayBuffer();
  const uploadHeaders: Record<string, string> = { ...putHeaders };
  const contentType = fileRes.headers.get("content-type");
  if (contentType) {
    uploadHeaders["Content-Type"] = contentType;
  }

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body: fileBuffer,
  });
  if (!putRes.ok) {
    return {
      ok: false,
      error: `Clio upload failed: ${putRes.status} ${await readClioError(putRes)}`,
    };
  }

  if (docId) {
    const patchRes = await fetch(buildClioUrl(`/documents/${encodeURIComponent(docId)}`), {
      method: "PATCH",
      headers,
      body: JSON.stringify({ upload_completed: true }),
    });
    if (!patchRes.ok) {
      console.warn("[clioAdapter] PATCH upload_completed failed:", patchRes.status, await readClioError(patchRes));
    }
  }

  return { ok: true, clioDocumentId: docId };
}

export async function syncClioMatterWriteBackOnIngest(
  params: SyncClioMatterWriteBackOnIngestParams
): Promise<SyncClioMatterWriteBackOnIngestResult> {
  const { firmId, caseId, documentId } = params;
  const context = await getClioMatterApiContext(firmId, caseId);
  if (!context.ok) {
    return {
      noteStatus: "skipped",
      claimNumberStatus: "skipped_unconfigured",
      noteError: context.error,
      claimNumberError: context.error,
    };
  }

  const documentContext = await loadClioWriteBackDocumentContext(firmId, documentId);
  if (!documentContext) {
    return {
      noteStatus: "failed",
      noteError: "Document context not found",
      claimNumberStatus: "failed",
      claimNumberError: "Document context not found",
    };
  }

  const claimNumberAssessment = assessClioClaimNumberCandidate(documentContext);
  const claimNumberCandidate = claimNumberAssessment.status === "candidate"
    ? claimNumberAssessment.candidate
    : null;
  const note = buildClioMatterNote({
    fileName: documentContext.fileName,
    documentId,
    source: documentContext.source,
    ingestedAt: documentContext.ingestedAt,
    docType: documentContext.docType,
    claimNumberCandidate: claimNumberCandidate?.claimNumber ?? null,
  });

  const noteResult = await createClioMatterNote({
    accessToken: context.accessToken,
    matterId: context.matterId,
    note,
  });
  const noteStatus = noteResult.ok ? "added" : "failed";
  const noteId = noteResult.ok ? noteResult.noteId : undefined;
  const noteError = "error" in noteResult ? noteResult.error : undefined;
  if (noteResult.ok) {
    await auditClioWriteBackEvent({
      firmId,
      caseId,
      documentId,
      action: "clio_note_added",
      metaJson: {
        clioMatterId: context.matterId,
        clioNoteId: noteResult.noteId ?? null,
      },
    });
  }

  const matterResult = await fetchClioMatter({
    accessToken: context.accessToken,
    matterId: context.matterId,
  });
  if (!matterResult.ok) {
    const matterError = "error" in matterResult ? matterResult.error : "Clio fetch matter failed";
    return {
      noteStatus,
      noteId,
      noteError,
      claimNumberStatus: "failed",
      claimNumberError: matterError,
      claimNumber: claimNumberCandidate?.claimNumber ?? null,
    };
  }

  const currentFieldValue = context.claimNumberCustomFieldId
    ? findClioCustomFieldValue(matterResult.matter.customFieldValues, context.claimNumberCustomFieldId)
    : null;
  const currentClaimNumber = normalizeString(currentFieldValue?.value);
  const decision = decideClioClaimNumberWriteBack({
    claimNumberCustomFieldId: context.claimNumberCustomFieldId,
    candidate: claimNumberCandidate,
    missingCandidateAction: claimNumberAssessment.status === "candidate"
      ? undefined
      : claimNumberAssessment.status,
    currentFieldValue: currentClaimNumber,
  });

  if (decision.action === "skip_unconfigured") {
    return {
      noteStatus,
      noteId,
      noteError,
      claimNumberStatus: "skipped_unconfigured",
      claimNumber: claimNumberCandidate?.claimNumber ?? null,
    };
  }
  if (decision.action === "skip_low_confidence") {
    return {
      noteStatus,
      noteId,
      noteError,
      claimNumberStatus: "skipped_low_confidence",
    };
  }
  if (decision.action === "skip_no_candidate") {
    return {
      noteStatus,
      noteId,
      noteError,
      claimNumberStatus: "skipped_no_candidate",
    };
  }
  if (decision.action === "already_set") {
    return {
      noteStatus,
      noteId,
      noteError,
      claimNumberStatus: "already_set",
      claimNumber: decision.claimNumber,
      currentClaimNumber: decision.claimNumber,
    };
  }
  if (decision.action === "conflict") {
    await auditClioWriteBackEvent({
      firmId,
      caseId,
      documentId,
      action: "clio_claim_number_conflict",
      metaJson: {
        clioMatterId: context.matterId,
        claimNumberCustomFieldId: context.claimNumberCustomFieldId,
        candidateClaimNumber: decision.claimNumber,
        currentClaimNumber: decision.currentValue,
      },
    });
    logActivity({
      firmId,
      caseId,
      documentId,
      type: "clio_claim_number_review",
      title: "Clio claim number needs review",
      meta: {
        clioMatterId: context.matterId,
        claimNumberCustomFieldId: context.claimNumberCustomFieldId,
        candidateClaimNumber: decision.claimNumber,
        currentClaimNumber: decision.currentValue,
      },
    });
    logWarn("clio_claim_number_conflict", {
      firmId,
      caseId,
      documentId,
      clioMatterId: context.matterId,
      claimNumberCustomFieldId: context.claimNumberCustomFieldId,
      candidateClaimNumber: decision.claimNumber,
      currentClaimNumber: decision.currentValue,
    });
    return {
      noteStatus,
      noteId,
      noteError,
      claimNumberStatus: "conflict",
      claimNumber: decision.claimNumber,
      currentClaimNumber: decision.currentValue,
    };
  }

  const patchResult = await patchClioMatterClaimNumber({
    accessToken: context.accessToken,
    matterId: context.matterId,
    customFieldId: context.claimNumberCustomFieldId!,
    customFieldValueRowId: currentFieldValue?.id,
    claimNumber: decision.claimNumber,
  });
  if (!patchResult.ok) {
    const patchError = "error" in patchResult ? patchResult.error : "Clio patch matter failed";
    return {
      noteStatus,
      noteId,
      noteError,
      claimNumberStatus: "failed",
      claimNumber: decision.claimNumber,
      claimNumberError: patchError,
    };
  }

  await auditClioWriteBackEvent({
    firmId,
    caseId,
    documentId,
    action: "clio_claim_number_updated",
    metaJson: {
      clioMatterId: context.matterId,
      claimNumberCustomFieldId: context.claimNumberCustomFieldId,
      claimNumber: decision.claimNumber,
    },
  });

  return {
    noteStatus,
    noteId,
    noteError,
    claimNumberStatus: "updated",
    claimNumber: decision.claimNumber,
  };
}
