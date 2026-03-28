import JSZip from "jszip";
import { prisma } from "../db/prisma";
import {
  listClioContactRows,
  listClioMatterRows,
  renderClioContactsCsv,
  renderClioMattersCsv,
} from "../exports/clioExport";
import { getClioHandoffSummaryByCaseIds } from "./clioHandoffTracking";
import { buildExportBundle } from "./export/contract";

type BatchClioHandoffExportInput = {
  firmId: string;
  caseIds: string[];
  allowReexport?: boolean;
  exportedAt?: Date;
};

type BatchClioHandoffIncludedCase = {
  id: string;
  caseNumber: string | null;
  isReExport: boolean;
};

type BatchClioHandoffSkippedCase = {
  id: string;
  reason: string;
};

export type BatchClioHandoffManifest = {
  exportTimestamp: string;
  includedCaseIds: string[];
  includedCaseNumbers: string[];
  includedCases: BatchClioHandoffIncludedCase[];
  reexportedCaseIds: string[];
  reexportedCaseNumbers: string[];
  skippedCases: BatchClioHandoffSkippedCase[];
  contactsRowCount: number;
  mattersRowCount: number;
};

export type BatchClioHandoffExportResult = {
  zipBuffer: Buffer;
  fileName: string;
  contactsFileName: string;
  mattersFileName: string;
  manifestFileName: string;
  contactsCsv: string;
  mattersCsv: string;
  manifest: BatchClioHandoffManifest;
};

type BatchExportCaseRecord = {
  id: string;
  caseNumber: string | null;
  createdAt: Date;
};

function normalizeCaseIds(caseIds: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of caseIds) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function compareBatchExportCases(a: BatchExportCaseRecord, b: BatchExportCaseRecord): number {
  const aCaseNumber = a.caseNumber?.trim() ?? "";
  const bCaseNumber = b.caseNumber?.trim() ?? "";

  if (aCaseNumber && bCaseNumber) {
    const caseNumberCompare = aCaseNumber.localeCompare(bCaseNumber, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (caseNumberCompare !== 0) return caseNumberCompare;
  } else if (aCaseNumber) {
    return -1;
  } else if (bCaseNumber) {
    return 1;
  }

  const createdAtCompare = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdAtCompare !== 0) return createdAtCompare;

  return a.id.localeCompare(b.id);
}

function formatDatePart(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getCaseReadinessSkipReason(caseId: string, firmId: string): Promise<string | null> {
  const bundle = await buildExportBundle(caseId, firmId, {
    includeTimeline: false,
    includeSummary: false,
    useNamingRules: false,
  });

  if (!bundle) {
    return "Case not found";
  }

  if (bundle.documents.length > 0) {
    return null;
  }

  const docCounts = await prisma.document.groupBy({
    by: ["reviewState"],
    where: { firmId, routedCaseId: caseId },
    _count: { _all: true },
  });

  const totalDocs = docCounts.reduce((sum, row) => sum + row._count._all, 0);
  const persistedReviewDocs = docCounts
    .filter((row) => row.reviewState != null)
    .reduce((sum, row) => sum + row._count._all, 0);
  const exportReadyDocs = docCounts
    .filter((row) => row.reviewState === "EXPORT_READY")
    .reduce((sum, row) => sum + row._count._all, 0);

  if (totalDocs === 0) {
    return "This case has no routed documents to export yet.";
  }
  if (persistedReviewDocs > 0 && exportReadyDocs === 0) {
    return "No export-ready documents are available for this case yet.";
  }
  return "No documents matched this export packet.";
}

export async function buildBatchClioHandoffExport(
  input: BatchClioHandoffExportInput
): Promise<BatchClioHandoffExportResult> {
  const requestedCaseIds = normalizeCaseIds(input.caseIds);
  if (requestedCaseIds.length === 0) {
    throw new Error("caseIds must contain at least one case id.");
  }

  const exportedAt = input.exportedAt ?? new Date();
  const datePart = formatDatePart(exportedAt);
  const handoffSummaryByCaseId = await getClioHandoffSummaryByCaseIds(input.firmId, requestedCaseIds);
  const cases = await prisma.legalCase.findMany({
    where: {
      firmId: input.firmId,
      id: { in: requestedCaseIds },
    },
    select: {
      id: true,
      caseNumber: true,
      createdAt: true,
    },
  });

  const casesById = new Map(cases.map((item) => [item.id, item]));
  const skippedCases: BatchClioHandoffSkippedCase[] = requestedCaseIds
    .filter((caseId) => !casesById.has(caseId))
    .map((caseId) => ({ id: caseId, reason: "Case not found" }));

  const includedCases: BatchClioHandoffIncludedCase[] = [];
  const sortedCases = [...cases].sort(compareBatchExportCases);

  for (const legalCase of sortedCases) {
    const handoffSummary = handoffSummaryByCaseId.get(legalCase.id);
    const isReExport = handoffSummary?.alreadyExported === true;
    if (isReExport && input.allowReexport !== true) {
      const lastExportedAt = handoffSummary.lastExportedAt
        ? new Date(handoffSummary.lastExportedAt).toISOString().slice(0, 10)
        : null;
      skippedCases.push({
        id: legalCase.id,
        reason: lastExportedAt
          ? `Already handed off to Clio on ${lastExportedAt}. Select include re-exports to export it again.`
          : "Already handed off to Clio. Select include re-exports to export it again.",
      });
      continue;
    }

    const readinessSkipReason = await getCaseReadinessSkipReason(legalCase.id, input.firmId);
    if (readinessSkipReason != null) {
      skippedCases.push({ id: legalCase.id, reason: readinessSkipReason });
      continue;
    }

    const [contactRows, matterRows] = await Promise.all([
      listClioContactRows(input.firmId, { caseIds: [legalCase.id] }),
      listClioMatterRows(input.firmId, { caseIds: [legalCase.id] }),
    ]);

    if (contactRows.length === 0) {
      skippedCases.push({
        id: legalCase.id,
        reason: "This case does not have exportable client contact data yet.",
      });
      continue;
    }

    if (matterRows.length === 0) {
      skippedCases.push({
        id: legalCase.id,
        reason: "This case does not have exportable matter data yet.",
      });
      continue;
    }

    includedCases.push({
      id: legalCase.id,
      caseNumber: legalCase.caseNumber?.trim() || null,
      isReExport,
    });
  }

  const includedCaseIds = includedCases.map((item) => item.id);
  const [contactRows, matterRows]: [
    Awaited<ReturnType<typeof listClioContactRows>>,
    Awaited<ReturnType<typeof listClioMatterRows>>,
  ] =
    includedCaseIds.length > 0
      ? await Promise.all([
          listClioContactRows(input.firmId, {
            caseIds: includedCaseIds,
            preserveCaseOrder: true,
          }),
          listClioMatterRows(input.firmId, {
            caseIds: includedCaseIds,
            preserveCaseOrder: true,
          }),
        ])
      : [[], []];

  const contactsCsv = renderClioContactsCsv(contactRows);
  const mattersCsv = renderClioMattersCsv(matterRows);
  const manifest: BatchClioHandoffManifest = {
    exportTimestamp: exportedAt.toISOString(),
    includedCaseIds,
    includedCaseNumbers: includedCases.map((item) => item.caseNumber).filter((value): value is string => !!value),
    includedCases,
    reexportedCaseIds: includedCases.filter((item) => item.isReExport).map((item) => item.id),
    reexportedCaseNumbers: includedCases
      .filter((item) => item.isReExport && item.caseNumber)
      .map((item) => item.caseNumber as string),
    skippedCases,
    contactsRowCount: contactRows.length,
    mattersRowCount: matterRows.length,
  };

  const contactsFileName = `clio-contacts-batch-${datePart}.csv`;
  const mattersFileName = `clio-matters-batch-${datePart}.csv`;
  const manifestFileName = "manifest.json";
  const fileName = `clio-handoff-batch-${datePart}.zip`;
  const zip = new JSZip();

  zip.file(contactsFileName, contactsCsv, { date: exportedAt });
  zip.file(mattersFileName, mattersCsv, { date: exportedAt });
  zip.file(manifestFileName, JSON.stringify(manifest, null, 2) + "\n", { date: exportedAt });

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    zipBuffer,
    fileName,
    contactsFileName,
    mattersFileName,
    manifestFileName,
    contactsCsv,
    mattersCsv,
    manifest,
  };
}
