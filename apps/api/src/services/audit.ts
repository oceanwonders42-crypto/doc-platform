/**
 * Audit helpers for document and job events. Used by workers and API.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export async function addDocumentAuditEvent(input: {
  firmId: string;
  documentId: string;
  actor: string;
  action: string;
  fromCaseId?: string | null;
  toCaseId?: string | null;
  metaJson?: Record<string, unknown> | null;
}) {
  const { firmId, documentId, actor, action, fromCaseId, toCaseId, metaJson } = input;
  try {
    await prisma.documentAuditEvent.create({
      data: {
        firmId,
        documentId,
        actor,
        action,
        fromCaseId: fromCaseId ?? null,
        toCaseId: toCaseId ?? null,
        metaJson: metaJson != null ? (metaJson as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("[audit] failed to insert audit event", { err, firmId, documentId, action });
  }
}
