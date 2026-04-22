/**
 * CRM-agnostic export contract: unified shape for case + documents + timeline/summary
 * after document processing is complete. All export destinations consume this bundle.
 */

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { isDemandPackageReleaseBlocked } from "../demandNarrativeReview";

/** Doc types that belong in a "bills" packet (billing, EOB, ledger). */
const BILL_DOC_TYPES = new Set([
  "medical_bill",
  "ledger_statement",
  "billing_statement",
  "eob",
  "insurance_eob",
]);

export type ExportDocumentRef = {
  id: string;
  storageKey: string;
  originalName: string | null;
  mimeType: string;
  /** When firm naming rules are applied: safe export file name (without path). */
  exportFileName?: string | null;
  /** When firm naming rules and folderByDocType are used: relative folder path for this doc (e.g. "Medical/EOB"). */
  exportFolderPath?: string | null;
};

export type ExportBundle = {
  firmId: string;
  caseId: string;
  case: {
    title: string | null;
    caseNumber: string | null;
    clientName: string | null;
  };
  documents: ExportDocumentRef[];
  timelineText: string | null;
  summaryText: string | null;
  exportedAt: string; // ISO
};

export type BuildExportBundleOptions = {
  /** If provided, only include these document ids (must belong to case). Empty = all documents for case. */
  documentIds?: string[];
  includeTimeline?: boolean;
  includeSummary?: boolean;
  /** Apply firm-level file/folder naming rules (default true). */
  useNamingRules?: boolean;
  /** Packet type: records (medical/legal records only), bills (billing/EOB only), combined (all). Default combined. */
  packetType?: "records" | "bills" | "combined";
};

/**
 * Build the shared export bundle from internal case/document/provider data.
 * Use after processing is complete (documents routed to case). Does not modify any data.
 */
export async function buildExportBundle(
  caseId: string,
  firmId: string,
  options: BuildExportBundleOptions = {}
): Promise<ExportBundle | null> {
  const { documentIds, includeTimeline = true, includeSummary = false, useNamingRules = true, packetType = "combined" } = options;

  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, firmId },
    select: { id: true, title: true, caseNumber: true, clientName: true },
  });
  if (!legalCase) return null;

  const docWhere: { firmId: string; routedCaseId: string; id?: { in: string[] } } = {
    firmId,
    routedCaseId: caseId,
  };
  if (documentIds != null && documentIds.length > 0) {
    docWhere.id = { in: documentIds };
  }

  const docs = await prisma.document.findMany({
    where: docWhere,
    select: {
      id: true,
      spacesKey: true,
      originalName: true,
      mimeType: true,
      metaJson: true,
      extractedFields: true,
      reviewState: true,
    },
  });

  // New review-aware cases should only export documents that were explicitly marked export-ready.
  // Legacy cases without any persisted review lifecycle keep the old routed-document behavior.
  const hasPersistedReviewState = docs.some((d) => d.reviewState != null);
  const demandPackageStatusByDocId =
    docs.length > 0
      ? new Map(
          (
            await prisma.demandPackage.findMany({
              where: {
                firmId,
                generatedDocId: { in: docs.map((d) => d.id) },
              },
              select: { generatedDocId: true, status: true },
            })
          ).flatMap((pkg) => (pkg.generatedDocId ? ([[pkg.generatedDocId, pkg.status]] as const) : []))
        )
      : new Map<string, string>();
  let docsToUse = docs.filter((d) => {
    const demandPackageStatus = demandPackageStatusByDocId.get(d.id);
    if (demandPackageStatus != null) {
      return !isDemandPackageReleaseBlocked(demandPackageStatus);
    }
    return hasPersistedReviewState ? d.reviewState === "EXPORT_READY" : true;
  });
  if (packetType !== "combined" && docsToUse.length > 0) {
    const docIds = docsToUse.map((d) => d.id);
    const { rows } = await pgPool.query<{ document_id: string; doc_type: string | null }>(
      `select document_id, doc_type from document_recognition where document_id = any($1)`,
      [docIds]
    );
    const docTypeByDocId = new Map(rows.map((r) => [r.document_id, (r.doc_type ?? "").toLowerCase().trim()]));
    if (packetType === "bills") {
      docsToUse = docsToUse.filter((d) => BILL_DOC_TYPES.has(docTypeByDocId.get(d.id) ?? ""));
    } else {
      docsToUse = docsToUse.filter((d) => !BILL_DOC_TYPES.has(docTypeByDocId.get(d.id) ?? ""));
    }
  }

  const documents: ExportDocumentRef[] = [];
  const exportedAt = new Date().toISOString();

  if (useNamingRules) {
    const {
      getFirmExportNamingRules,
      getRecognitionForDocument,
      buildDocumentNamingContext,
      applyFilePattern,
      applyFolderPattern,
      getFolderForDocType,
    } = await import("./namingRules");
    const rules = await getFirmExportNamingRules(firmId);
    const caseData = {
      caseNumber: legalCase.caseNumber,
      clientName: legalCase.clientName,
      title: legalCase.title,
    };
    const caseCtx = buildDocumentNamingContext(
      caseData,
      { id: "", originalName: null },
      null,
      exportedAt
    );
    const caseLevelFolder = rules ? applyFolderPattern(rules, caseCtx) : "";

    for (const d of docsToUse) {
      if (!d.spacesKey) continue;
      const recognition = await getRecognitionForDocument(d.id);
      const growthPrimary = (d.extractedFields as Record<string, unknown>)?.growthExtraction != null &&
        typeof (d.extractedFields as Record<string, unknown>).growthExtraction === "object"
        ? ((d.extractedFields as Record<string, unknown>).growthExtraction as { serviceDates?: { primaryServiceDate?: string | null } | null })?.serviceDates?.primaryServiceDate ?? undefined
        : undefined;
      const ctx = buildDocumentNamingContext(caseData, d, recognition, exportedAt, growthPrimary);
      let exportFileName: string | null;
      let exportFolderPath: string | null;
      const meta = (d.metaJson ?? {}) as Record<string, unknown>;
      const folderOverride = meta.exportFolderPathOverride != null ? String(meta.exportFolderPathOverride).trim() || null : null;
      const nameOverride = meta.exportFileNameOverride != null ? String(meta.exportFileNameOverride).trim() || null : null;

      if (nameOverride) {
        const ext = (d.originalName ?? "").split(".").pop()?.toLowerCase() || "bin";
        exportFileName = nameOverride.includes(".") ? nameOverride : `${nameOverride}.${ext}`;
      } else {
        const base = rules ? applyFilePattern(rules, ctx) : null;
        const ext = (d.originalName ?? "").split(".").pop()?.toLowerCase() || "bin";
        exportFileName = base ? `${base}.${ext}` : null;
      }
      if (folderOverride !== null) {
        exportFolderPath = folderOverride;
      } else {
        const docTypeFolder = rules ? getFolderForDocType(rules, ctx.documentType) : "";
        exportFolderPath = [caseLevelFolder, docTypeFolder].filter(Boolean).join("/") || null;
      }

      documents.push({
        id: d.id,
        storageKey: d.spacesKey,
        originalName: d.originalName,
        mimeType: d.mimeType ?? "application/octet-stream",
        exportFileName: exportFileName ?? undefined,
        exportFolderPath: exportFolderPath ?? undefined,
      });
    }
  } else {
    for (const d of docsToUse) {
      if (!d.spacesKey) continue;
      documents.push({
        id: d.id,
        storageKey: d.spacesKey!,
        originalName: d.originalName,
        mimeType: d.mimeType ?? "application/octet-stream",
      });
    }
  }

  let timelineText: string | null = null;
  if (includeTimeline) {
    const events = await prisma.caseTimelineEvent.findMany({
      where: { caseId, firmId },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      select: {
        eventDate: true,
        eventType: true,
        track: true,
        provider: true,
        diagnosis: true,
        procedure: true,
        amount: true,
      },
    });
    const formatDate = (d: Date | null) => {
      if (!d) return "";
      try {
        return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      } catch {
        return "";
      }
    };
    const lines = events.map(
      (e) =>
        `${formatDate(e.eventDate)}\t${e.eventType || e.track || "Event"}\t${e.provider ?? ""}\t${e.diagnosis ?? ""}\t${e.procedure ?? ""}\t${e.amount ?? ""}`
    );
    timelineText = "Date\tType\tProvider\tDiagnosis\tProcedure\tAmount\n" + lines.join("\n");
  }

  let summaryText: string | null = null;
  if (includeSummary) {
    const summary = await prisma.caseSummary.findFirst({
      where: { firmId, caseId },
      select: { body: true },
    });
    summaryText = summary?.body ?? "No summary generated yet.";
  }

  return {
    firmId,
    caseId,
    case: {
      title: legalCase.title,
      caseNumber: legalCase.caseNumber,
      clientName: legalCase.clientName,
    },
    documents,
    timelineText,
    summaryText,
    exportedAt,
  };
}
