/**
 * Bulk document actions for premium tier: route/unroute many documents in one request.
 * Gated by hasPremiumWorkflow; uses premiumWorkflowConfig for limits.
 */
import { prisma } from "../db/prisma";
import { routeDocument } from "./documentRouting";
import { getWorkflowConfig, getBulkRouteLimit } from "./premiumWorkflowConfig";

export type BulkRouteResult = {
  ok: true;
  routed: number;
  skipped: number;
  errors: { documentId: string; error: string }[];
};

export type BulkRouteFailure = { ok: false; error: string };

export async function bulkRouteDocuments(
  firmId: string,
  documentIds: string[],
  caseId: string,
  actor: string
): Promise<BulkRouteResult | BulkRouteFailure> {
  const limit = getBulkRouteLimit(await getWorkflowConfig(firmId));
  const ids = documentIds.slice(0, limit);
  const caseRow = await prisma.legalCase.findFirst({
    where: { id: caseId, firmId },
    select: { id: true },
  });
  if (!caseRow) return { ok: false, error: "Case not found" };

  const errors: { documentId: string; error: string }[] = [];
  let routed = 0;
  let skipped = 0;

  for (const docId of ids) {
    const doc = await prisma.document.findFirst({
      where: { id: docId, firmId },
      select: { id: true },
    });
    if (!doc) {
      errors.push({ documentId: docId, error: "Document not found" });
      continue;
    }
    const result = await routeDocument(firmId, docId, caseId, {
      actor,
      action: "bulk_route",
      metaJson: { bulkRouteCaseId: caseId },
    });
    if (result.ok) routed++;
    else {
      errors.push({ documentId: docId, error: result.error });
    }
  }

  if (documentIds.length > limit) skipped = documentIds.length - limit;

  return { ok: true, routed, skipped, errors };
}

export async function bulkUnrouteDocuments(
  firmId: string,
  documentIds: string[],
  actor: string
): Promise<BulkRouteResult | BulkRouteFailure> {
  const config = await getWorkflowConfig(firmId);
  const limit = getBulkRouteLimit(config);
  const ids = documentIds.slice(0, limit);
  const errors: { documentId: string; error: string }[] = [];
  let routed = 0;
  let skipped = 0;

  for (const docId of ids) {
    const doc = await prisma.document.findFirst({
      where: { id: docId, firmId },
      select: { id: true },
    });
    if (!doc) {
      errors.push({ documentId: docId, error: "Document not found" });
      continue;
    }
    const result = await routeDocument(firmId, docId, null, {
      actor,
      action: "bulk_unroute",
      metaJson: {},
    });
    if (result.ok) routed++;
    else errors.push({ documentId: docId, error: result.error });
  }

  if (documentIds.length > limit) skipped = documentIds.length - limit;

  return { ok: true, routed, skipped, errors };
}
