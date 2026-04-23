import { prisma } from "../db/prisma";

export type DemandPackageReadinessSnapshot = {
  suggestedTitle: string;
  warnings: string[];
  stats: {
    documentCount: number;
    timelineEventCount: number;
    providerCount: number;
    recordsRequestCount: number;
    hasCaseSummary: boolean;
    hasMedicalBills: boolean;
    hasSettlementOffer: boolean;
  };
};

function pushUnique(target: string[], value: string | null | undefined) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

function buildSuggestedTitle(input: {
  clientName: string | null;
  caseNumber: string | null;
  title: string | null;
}): string {
  const label =
    input.clientName?.trim() ||
    input.caseNumber?.trim() ||
    input.title?.trim() ||
    "Case";
  return `${label} Demand Package`;
}

export async function buildDemandPackageReadinessSnapshot(
  caseId: string,
  firmId: string
): Promise<DemandPackageReadinessSnapshot> {
  const [legalCase, caseSummary, caseFinancial, documentCount, timelineEventCount, providerCount, recordsRequestCount] =
    await Promise.all([
      prisma.legalCase.findFirst({
        where: { id: caseId, firmId },
        select: {
          title: true,
          caseNumber: true,
          clientName: true,
        },
      }),
      prisma.caseSummary.findFirst({
        where: { caseId, firmId },
        select: { body: true },
      }),
      prisma.caseFinancial.findFirst({
        where: { caseId, firmId },
        select: {
          medicalBillsTotal: true,
          settlementOffer: true,
        },
      }),
      prisma.document.count({
        where: { firmId, routedCaseId: caseId },
      }),
      prisma.caseTimelineEvent.count({
        where: { firmId, caseId },
      }),
      prisma.caseProvider.count({
        where: { firmId, caseId },
      }),
      prisma.recordsRequest.count({
        where: { firmId, caseId },
      }),
    ]);

  const warnings: string[] = [];
  if (!legalCase) {
    pushUnique(warnings, "Case not found.");
  }
  if (!(caseSummary?.body?.trim().length)) {
    pushUnique(warnings, "No case summary is stored yet; demand drafting will rely on raw chronology and documents.");
  }
  if (documentCount === 0) {
    pushUnique(warnings, "No routed case documents are available yet.");
  }
  if (timelineEventCount === 0) {
    pushUnique(warnings, "Chronology has not been built yet, so treatment sequencing may be incomplete.");
  }
  if (providerCount === 0) {
    pushUnique(warnings, "No treating providers are linked to this case.");
  }
  if ((caseFinancial?.medicalBillsTotal ?? 0) <= 0) {
    pushUnique(warnings, "Medical specials have not been itemized yet.");
  }
  if (recordsRequestCount > 0) {
    pushUnique(
      warnings,
      "Open records requests exist; generated demand sections may need another pass after those records arrive."
    );
  }

  return {
    suggestedTitle: buildSuggestedTitle({
      clientName: legalCase?.clientName ?? null,
      caseNumber: legalCase?.caseNumber ?? null,
      title: legalCase?.title ?? null,
    }),
    warnings,
    stats: {
      documentCount,
      timelineEventCount,
      providerCount,
      recordsRequestCount,
      hasCaseSummary: Boolean(caseSummary?.body?.trim().length),
      hasMedicalBills: (caseFinancial?.medicalBillsTotal ?? 0) > 0,
      hasSettlementOffer:
        typeof caseFinancial?.settlementOffer === "number" &&
        Number.isFinite(caseFinancial.settlementOffer),
    },
  };
}
