/**
 * Admin correction actions: routing, provider, and export overrides.
 * All corrections are audited via DocumentAuditEvent; no direct DB edits required for common workflows.
 */
import { pgPool } from "../db/pg";
import { prisma } from "../db/prisma";
import { routeDocument } from "./documentRouting";
import { ensureProviderCaseLinkFromDocument } from "./providerCaseLinking";
import { addDocumentAuditEvent } from "./audit";

const AUDIT_ACTIONS = {
  ROUTING_CORRECTED: "routing_corrected",
  PROVIDER_CORRECTED: "provider_corrected",
  RECOGNITION_CORRECTED: "recognition_corrected",
  EXPORT_NAME_CORRECTED: "export_name_corrected",
} as const;

export { AUDIT_ACTIONS };

/**
 * Correct document routing (wrong case). Uses shared routeDocument; audit action is "routing_corrected".
 */
export async function correctRouting(
  firmId: string,
  documentId: string,
  toCaseId: string | null,
  actor: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await routeDocument(firmId, documentId, toCaseId, {
    actor,
    action: AUDIT_ACTIONS.ROUTING_CORRECTED,
    routedSystem: "manual",
    routingStatus: toCaseId ? "routed" : null,
    metaJson: { correction: true, toCaseId },
  });
  return result;
}

/**
 * Correct provider match for a document. Updates document_recognition.suggested_provider_id;
 * if document is routed to a case, ensures CaseProvider link. Audited as "provider_corrected".
 */
export async function correctProvider(
  firmId: string,
  documentId: string,
  providerId: string | null,
  actor: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { id: true, routedCaseId: true },
  });
  if (!doc) return { ok: false, error: "document not found" };

  if (providerId != null) {
    const provider = await prisma.provider.findFirst({
      where: { id: providerId, firmId },
      select: { id: true, name: true },
    });
    if (!provider) return { ok: false, error: "provider not found or not in firm" };
  }

  const { rows: recRows } = await pgPool.query<{ suggested_provider_id: string | null; provider_name: string | null }>(
    `select suggested_provider_id, provider_name from document_recognition where document_id = $1`,
    [documentId]
  );
  const before = recRows[0];
  const previousProviderId = before?.suggested_provider_id?.trim() || null;

  if (providerId === previousProviderId) {
    return { ok: true };
  }

  const recExists = recRows.length > 0;
  if (recExists) {
    await pgPool.query(
      `update document_recognition set suggested_provider_id = $1, provider_resolution_status = $2, updated_at = now() where document_id = $3`,
      [providerId ?? null, providerId ? "resolved" : null, documentId]
    );
  } else if (providerId != null) {
    await pgPool.query(
      `insert into document_recognition (document_id, suggested_provider_id, provider_resolution_status, updated_at)
       values ($1, $2, 'resolved', now())
       on conflict (document_id) do update set suggested_provider_id = $2, provider_resolution_status = 'resolved', updated_at = now()`,
      [documentId, providerId]
    );
  }
  /* else: no row and clearing provider – nothing to persist */

  if (doc.routedCaseId && providerId) {
    await ensureProviderCaseLinkFromDocument(firmId, documentId, doc.routedCaseId).catch((e) => {
      console.warn("[adminCorrections] ensureProviderCaseLinkFromDocument after correctProvider failed", { documentId, caseId: doc.routedCaseId, err: e });
    });
  }

  await addDocumentAuditEvent({
    firmId,
    documentId,
    actor,
    action: AUDIT_ACTIONS.PROVIDER_CORRECTED,
    metaJson: {
      correction: true,
      fromProviderId: previousProviderId,
      toProviderId: providerId,
      routedCaseId: doc.routedCaseId ?? undefined,
    },
  });

  return { ok: true };
}

/**
 * Set export file name / folder path overrides on a document (metaJson).
 * Use when display/export naming is wrong and recognition is correct. Audited as "export_name_corrected".
 */
export async function setExportOverrides(
  firmId: string,
  documentId: string,
  overrides: { exportFileNameOverride?: string | null; exportFolderPathOverride?: string | null },
  actor: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { id: true, metaJson: true },
  });
  if (!doc) return { ok: false, error: "document not found" };

  const meta = (doc.metaJson ?? {}) as Record<string, unknown>;
  const before = {
    exportFileNameOverride: meta.exportFileNameOverride != null ? String(meta.exportFileNameOverride) : null,
    exportFolderPathOverride: meta.exportFolderPathOverride != null ? String(meta.exportFolderPathOverride) : null,
  };
  const next = {
    ...meta,
    ...(overrides.exportFileNameOverride !== undefined && { exportFileNameOverride: overrides.exportFileNameOverride ?? null }),
    ...(overrides.exportFolderPathOverride !== undefined && { exportFolderPathOverride: overrides.exportFolderPathOverride ?? null }),
  };

  await prisma.document.update({
    where: { id: documentId },
    data: { metaJson: next as object },
  });

  await addDocumentAuditEvent({
    firmId,
    documentId,
    actor,
    action: AUDIT_ACTIONS.EXPORT_NAME_CORRECTED,
    metaJson: {
      correction: true,
      before: { exportFileNameOverride: before.exportFileNameOverride, exportFolderPathOverride: before.exportFolderPathOverride },
      after: {
        exportFileNameOverride: next.exportFileNameOverride ?? null,
        exportFolderPathOverride: next.exportFolderPathOverride ?? null,
      },
    },
  });

  return { ok: true };
}
