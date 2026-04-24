import { prisma } from "../db/prisma";
import { generateCaseSummary } from "./caseSummaryService";
import { getCaseInsights } from "./caseInsights";

type AnalysisSeverity = "low" | "medium" | "high";

export type MissingRecordsFlag = {
  id: string;
  type: "timeline_gap" | "provider_without_records" | "outstanding_request";
  severity: AnalysisSeverity;
  title: string;
  summary: string;
  providerName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  recordsRequestId?: string | null;
  recommendedAction?: string | null;
  relatedDocumentIds?: string[];
};

export type MissingRecordsAnalysisResult = {
  generatedAt: string;
  hasEvidence: boolean;
  flags: MissingRecordsFlag[];
  recommendedRequests: Array<{
    providerName: string;
    reason: string;
    recordsRequestId?: string | null;
  }>;
  message?: string;
};

export type BillsVsTreatmentFlag = {
  id: string;
  type: "bill_without_treatment" | "treatment_without_bill" | "date_mismatch";
  severity: AnalysisSeverity;
  title: string;
  summary: string;
  providerName?: string | null;
  billLineId?: string | null;
  documentId?: string | null;
  serviceDate?: string | null;
  treatmentDate?: string | null;
};

export type BillsVsTreatmentAnalysisResult = {
  generatedAt: string;
  hasEvidence: boolean;
  flags: BillsVsTreatmentFlag[];
  message?: string;
};

export type CaseQaSource = {
  kind: "document" | "timeline" | "provider" | "financial" | "analysis" | "demand";
  label: string;
  documentId?: string | null;
};

export type CaseQaResponse = {
  generatedAt: string;
  grounded: boolean;
  answer: string;
  warnings: string[];
  sources: CaseQaSource[];
};

type LoadedCaseAiContext = {
  legalCase: {
    id: string;
    title: string | null;
    caseNumber: string | null;
    clientName: string | null;
    incidentDate: Date | null;
  };
  timelineEvents: Array<{
    id: string;
    provider: string | null;
    eventDate: Date | null;
    eventType: string | null;
    track: string;
    documentId: string;
  }>;
  caseProviders: Array<{
    providerId: string;
    providerName: string | null;
  }>;
  recordsRequests: Array<{
    id: string;
    providerName: string;
    status: string;
    sentAt: Date | null;
    dueAt: Date | null;
  }>;
  documents: Array<{
    id: string;
    originalName: string;
    status: string;
    processedAt: Date | null;
    createdAt: Date;
    extractedFields: unknown;
  }>;
  billLines: Array<{
    id: string;
    documentId: string;
    providerName: string | null;
    serviceDate: Date | null;
    lineTotal: number | null;
    amountCharged: number | null;
  }>;
  financial: {
    medicalBillsTotal: number;
    liensTotal: number;
    settlementOffer: number | null;
    settlementAccepted: number | null;
  } | null;
  demandPackages: Array<{
    id: string;
    title: string;
    status: string;
    generatedAt: Date | null;
  }>;
};

function normalizeProviderName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function formatDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function formatShortDate(value: Date | null | undefined): string {
  if (!value) return "unknown date";
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dateDiffDays(left: Date | null | undefined, right: Date | null | undefined): number | null {
  if (!left || !right) return null;
  return Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
}

function isReceivedRecordsStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "received" || normalized === "complete";
}

function extractProviderHints(extractedFields: unknown): string[] {
  if (!extractedFields || typeof extractedFields !== "object" || Array.isArray(extractedFields)) {
    return [];
  }
  const record = extractedFields as Record<string, unknown>;
  return [record.providerName, record.provider, record.facility]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

async function loadCaseAiContext(caseId: string, firmId: string): Promise<LoadedCaseAiContext> {
  const [
    legalCase,
    timelineEvents,
    caseProviders,
    recordsRequests,
    documents,
    billLines,
    financial,
    demandPackages,
  ] = await Promise.all([
    prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: {
        id: true,
        title: true,
        caseNumber: true,
        clientName: true,
        incidentDate: true,
      },
    }),
    prisma.caseTimelineEvent.findMany({
      where: { caseId, firmId },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        provider: true,
        eventDate: true,
        eventType: true,
        track: true,
        documentId: true,
      },
    }),
    prisma.caseProvider.findMany({
      where: { caseId, firmId },
      select: {
        providerId: true,
        provider: { select: { name: true } },
      },
    }),
    prisma.recordsRequest.findMany({
      where: { caseId, firmId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        providerName: true,
        status: true,
        sentAt: true,
        dueAt: true,
      },
    }),
    prisma.document.findMany({
      where: { routedCaseId: caseId, firmId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalName: true,
        status: true,
        processedAt: true,
        createdAt: true,
        extractedFields: true,
      },
    }),
    prisma.medicalBillLineItem.findMany({
      where: { caseId, firmId },
      orderBy: [{ serviceDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        documentId: true,
        providerName: true,
        serviceDate: true,
        lineTotal: true,
        amountCharged: true,
      },
    }),
    prisma.caseFinancial.findFirst({
      where: { caseId, firmId },
      select: {
        medicalBillsTotal: true,
        liensTotal: true,
        settlementOffer: true,
        settlementAccepted: true,
      },
    }),
    prisma.demandPackage.findMany({
      where: { caseId, firmId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        generatedAt: true,
      },
    }),
  ]);

  if (!legalCase) {
    throw new Error("Case not found");
  }

  return {
    legalCase,
    timelineEvents,
    caseProviders: caseProviders.map((providerLink) => ({
      providerId: providerLink.providerId,
      providerName: providerLink.provider?.name ?? null,
    })),
    recordsRequests,
    documents,
    billLines: billLines.map((line) => ({
      ...line,
      lineTotal: line.lineTotal == null ? null : Number(line.lineTotal),
      amountCharged: line.amountCharged == null ? null : Number(line.amountCharged),
    })),
    financial: financial
      ? {
          medicalBillsTotal: financial.medicalBillsTotal,
          liensTotal: financial.liensTotal,
          settlementOffer: financial.settlementOffer,
          settlementAccepted: financial.settlementAccepted,
        }
      : null,
    demandPackages,
  };
}

export async function analyzeMissingRecords(
  caseId: string,
  firmId: string
): Promise<MissingRecordsAnalysisResult> {
  const context = await loadCaseAiContext(caseId, firmId);
  const providerEvidence = new Set<string>();
  const flags: MissingRecordsFlag[] = [];

  for (const event of context.timelineEvents) {
    const normalized = normalizeProviderName(event.provider);
    if (normalized) providerEvidence.add(normalized);
  }
  for (const document of context.documents) {
    for (const providerName of extractProviderHints(document.extractedFields)) {
      const normalized = normalizeProviderName(providerName);
      if (normalized) providerEvidence.add(normalized);
    }
  }

  for (const provider of context.caseProviders) {
    const normalized = normalizeProviderName(provider.providerName);
    if (!normalized || providerEvidence.has(normalized)) continue;
    flags.push({
      id: `provider-${provider.providerId}`,
      type: "provider_without_records",
      severity: "medium",
      title: "Provider linked to case but no records found",
      summary: `${provider.providerName ?? "A linked provider"} is attached to the case, but no routed documents or timeline events reference that provider yet.`,
      providerName: provider.providerName,
      recommendedAction: provider.providerName
        ? `Create or follow up on a records request for ${provider.providerName}.`
        : "Create or follow up on a records request for this provider.",
      relatedDocumentIds: [],
    });
  }

  const datedEvents = context.timelineEvents.filter((event) => event.eventDate != null);
  for (let index = 1; index < datedEvents.length; index += 1) {
    const previous = datedEvents[index - 1];
    const current = datedEvents[index];
    const gapDays = dateDiffDays(previous.eventDate, current.eventDate);
    if (gapDays == null || gapDays <= 45) continue;
    flags.push({
      id: `gap-${previous.id}-${current.id}`,
      type: "timeline_gap",
      severity: gapDays > 90 ? "high" : "medium",
      title: "Gap in treatment coverage",
      summary: `There is a ${Math.round(gapDays)} day gap between ${formatShortDate(previous.eventDate)} and ${formatShortDate(current.eventDate)}.`,
      startDate: formatDate(previous.eventDate),
      endDate: formatDate(current.eventDate),
      recommendedAction: "Confirm whether records are missing for the gap and request them if treatment continued.",
      relatedDocumentIds: [previous.documentId, current.documentId],
    });
  }

  for (const request of context.recordsRequests) {
    if (isReceivedRecordsStatus(request.status)) continue;
    flags.push({
      id: `request-${request.id}`,
      type: "outstanding_request",
      severity: request.dueAt && request.dueAt.getTime() < Date.now() ? "high" : "low",
      title: "Outstanding records request",
      summary: `${request.providerName} is still marked ${request.status.toLowerCase()}.`,
      providerName: request.providerName,
      recordsRequestId: request.id,
      recommendedAction: `Follow up with ${request.providerName} and refresh the request status once records arrive.`,
    });
  }

  const recommendedRequests = Array.from(
    new Map(
      flags
        .filter((flag) => flag.providerName)
        .map((flag) => [
          normalizeProviderName(flag.providerName ?? "") ?? flag.providerName ?? flag.id,
          {
            providerName: flag.providerName ?? "Unknown provider",
            reason: flag.title,
            recordsRequestId: flag.recordsRequestId ?? null,
          },
        ])
    ).values()
  );

  const hasEvidence =
    context.caseProviders.length > 0 ||
    context.timelineEvents.length > 0 ||
    context.documents.length > 0 ||
    context.recordsRequests.length > 0;

  return {
    generatedAt: new Date().toISOString(),
    hasEvidence,
    flags,
    recommendedRequests,
    message: hasEvidence
      ? undefined
      : "No providers, records requests, timeline events, or routed documents are stored for this case yet.",
  };
}

export async function analyzeBillsVsTreatment(
  caseId: string,
  firmId: string
): Promise<BillsVsTreatmentAnalysisResult> {
  const context = await loadCaseAiContext(caseId, firmId);
  const flags: BillsVsTreatmentFlag[] = [];
  const matchedBillIds = new Set<string>();
  const matchedTimelineIds = new Set<string>();
  const medicalEvents = context.timelineEvents.filter(
    (event) => event.track === "medical" && event.eventDate != null
  );

  for (const bill of context.billLines) {
    const normalizedBillProvider = normalizeProviderName(bill.providerName);
    const matches = medicalEvents.filter((event) => {
      const normalizedEventProvider = normalizeProviderName(event.provider);
      if (normalizedBillProvider && normalizedEventProvider && normalizedBillProvider !== normalizedEventProvider) {
        return false;
      }
      const diff = dateDiffDays(bill.serviceDate, event.eventDate);
      return diff != null && diff <= 14;
    });

    if (matches.length === 0) {
      flags.push({
        id: `bill-${bill.id}`,
        type: "bill_without_treatment",
        severity: "high",
        title: "Bill has no matching treatment event",
        summary: `${bill.providerName ?? "Unknown provider"} has a billed line on ${formatShortDate(bill.serviceDate)} without a matching treatment timeline entry within 14 days.`,
        providerName: bill.providerName,
        billLineId: bill.id,
        documentId: bill.documentId,
        serviceDate: formatDate(bill.serviceDate),
      });
      continue;
    }

    matchedBillIds.add(bill.id);
    for (const match of matches) {
      matchedTimelineIds.add(match.id);
      const diff = dateDiffDays(bill.serviceDate, match.eventDate);
      if (diff != null && diff > 3) {
        flags.push({
          id: `bill-date-${bill.id}-${match.id}`,
          type: "date_mismatch",
          severity: "medium",
          title: "Bill and treatment dates do not line up cleanly",
          summary: `${bill.providerName ?? "Unknown provider"} has billing on ${formatShortDate(bill.serviceDate)} and timeline activity on ${formatShortDate(match.eventDate)}.`,
          providerName: bill.providerName,
          billLineId: bill.id,
          documentId: bill.documentId,
          serviceDate: formatDate(bill.serviceDate),
          treatmentDate: formatDate(match.eventDate),
        });
      }
    }
  }

  for (const event of medicalEvents) {
    if (matchedTimelineIds.has(event.id)) continue;
    flags.push({
      id: `treatment-${event.id}`,
      type: "treatment_without_bill",
      severity: "medium",
      title: "Treatment event has no matching bill line",
      summary: `${event.provider ?? "Unknown provider"} has a treatment timeline event on ${formatShortDate(event.eventDate)} without a matching bill line within 14 days.`,
      providerName: event.provider,
      documentId: event.documentId,
      treatmentDate: formatDate(event.eventDate),
    });
  }

  const hasEvidence = context.billLines.length > 0 || medicalEvents.length > 0;
  return {
    generatedAt: new Date().toISOString(),
    hasEvidence,
    flags,
    message: hasEvidence
      ? undefined
      : "No medical bill lines or treatment timeline events are stored for this case yet.",
  };
}

function buildDocumentSourceMap(context: LoadedCaseAiContext): Map<string, string> {
  return new Map(context.documents.map((document) => [document.id, document.originalName]));
}

function chooseAnswerTopic(question: string): "missing" | "billing" | "providers" | "demands" | "timeline" | "summary" {
  const normalized = question.trim().toLowerCase();
  if (/(missing|gap|records request|records)/.test(normalized)) return "missing";
  if (/(bill|billing|medical specials|specials|cost|liens|settlement)/.test(normalized)) return "billing";
  if (/(provider|doctor|clinic|facility)/.test(normalized)) return "providers";
  if (/(demand|draft|package)/.test(normalized)) return "demands";
  if (/(timeline|chronology|when|date|treatment)/.test(normalized)) return "timeline";
  return "summary";
}

export async function answerCaseQuestion(
  caseId: string,
  firmId: string,
  question: string
): Promise<CaseQaResponse> {
  const [context, caseSummary, caseInsights, missingAnalysis, billsAnalysis] = await Promise.all([
    loadCaseAiContext(caseId, firmId),
    generateCaseSummary(caseId, firmId),
    getCaseInsights(caseId, firmId),
    analyzeMissingRecords(caseId, firmId),
    analyzeBillsVsTreatment(caseId, firmId),
  ]);

  const documentSourceMap = buildDocumentSourceMap(context);
  const topic = chooseAnswerTopic(question);
  const warnings: string[] = [];
  const sources: CaseQaSource[] = [];
  let answer = "";

  switch (topic) {
    case "missing": {
      if (!missingAnalysis.hasEvidence) {
        answer = missingAnalysis.message ?? "There is not enough case data yet to evaluate missing records.";
        warnings.push("Add routed documents, timeline entries, or records requests before relying on this answer.");
        break;
      }
      if (missingAnalysis.flags.length === 0) {
        answer = "I did not find any likely missing record gaps from the current providers, timeline, and records-request data.";
      } else {
        const topFlags = missingAnalysis.flags.slice(0, 3);
        answer = [
          `I found ${missingAnalysis.flags.length} likely record gap${missingAnalysis.flags.length === 1 ? "" : "s"} for this case.`,
          ...topFlags.map((flag) => `${flag.title}: ${flag.summary}`),
        ].join(" ");
        for (const flag of topFlags) {
          for (const documentId of flag.relatedDocumentIds ?? []) {
            const label = documentSourceMap.get(documentId);
            if (label) sources.push({ kind: "document", label, documentId });
          }
          if (flag.recordsRequestId) {
            sources.push({
              kind: "analysis",
              label: `Records request ${flag.recordsRequestId}`,
            });
          }
        }
      }
      break;
    }
    case "billing": {
      const parts: string[] = [];
      if (context.financial) {
        parts.push(
          `Stored financial totals show medical bills at $${context.financial.medicalBillsTotal.toLocaleString()} and liens at $${context.financial.liensTotal.toLocaleString()}.`
        );
        if (context.financial.settlementOffer != null) {
          parts.push(`The current settlement offer on file is $${context.financial.settlementOffer.toLocaleString()}.`);
          sources.push({ kind: "financial", label: "Case financial totals" });
        }
      }
      if (!billsAnalysis.hasEvidence) {
        parts.push(billsAnalysis.message ?? "No bill lines or treatment events are stored yet.");
      } else if (billsAnalysis.flags.length === 0) {
        parts.push("I did not find any obvious bill-versus-treatment mismatches in the stored data.");
      } else {
        parts.push(
          `I found ${billsAnalysis.flags.length} billing mismatch${billsAnalysis.flags.length === 1 ? "" : "es"} between bill lines and treatment events.`
        );
        for (const flag of billsAnalysis.flags.slice(0, 3)) {
          parts.push(`${flag.title}: ${flag.summary}`);
          if (flag.documentId) {
            const label = documentSourceMap.get(flag.documentId);
            if (label) sources.push({ kind: "document", label, documentId: flag.documentId });
          }
        }
      }
      answer = parts.join(" ");
      break;
    }
    case "providers": {
      const providerNames = Array.from(
        new Set(
          context.caseProviders
            .map((provider) => provider.providerName)
            .filter((value): value is string => Boolean(value))
        )
      );
      if (providerNames.length === 0) {
        answer = "No providers are linked to this case yet.";
      } else {
        answer = `The case currently has ${providerNames.length} linked provider${providerNames.length === 1 ? "" : "s"}: ${providerNames.join(", ")}.`;
        providerNames.slice(0, 5).forEach((providerName) => {
          sources.push({ kind: "provider", label: providerName });
        });
      }
      break;
    }
    case "demands": {
      if (context.demandPackages.length === 0) {
        answer = "No demand drafts have been generated for this case yet.";
      } else {
        const latestPackages = context.demandPackages.slice(0, 3);
        answer = [
          `There ${context.demandPackages.length === 1 ? "is" : "are"} ${context.demandPackages.length} demand draft${context.demandPackages.length === 1 ? "" : "s"} on file.`,
          ...latestPackages.map((pkg) => `${pkg.title} is ${pkg.status}${pkg.generatedAt ? ` (generated ${formatShortDate(pkg.generatedAt)})` : ""}.`),
        ].join(" ");
        latestPackages.forEach((pkg) => {
          sources.push({ kind: "demand", label: pkg.title });
        });
      }
      break;
    }
    case "timeline": {
      const timelineItems = context.timelineEvents.filter((event) => event.eventDate != null);
      if (timelineItems.length === 0) {
        answer = "No chronology events are stored for this case yet.";
      } else {
        const latestItems = timelineItems.slice(-3);
        answer = [
          `The chronology currently contains ${timelineItems.length} event${timelineItems.length === 1 ? "" : "s"}.`,
          ...latestItems.map((event) => {
            const provider = event.provider ? ` with ${event.provider}` : "";
            return `${formatShortDate(event.eventDate)}: ${event.eventType ?? "Case event"}${provider}.`;
          }),
        ].join(" ");
        latestItems.forEach((event) => {
          const label = documentSourceMap.get(event.documentId);
          if (label) sources.push({ kind: "timeline", label, documentId: event.documentId });
        });
      }
      break;
    }
    default: {
      const parts = [caseSummary.sections.conciseNarrative];
      if (caseInsights.insights.length > 0) {
        const topInsight = caseInsights.insights[0];
        parts.push(`Top case insight: ${topInsight.summary}.`);
        (topInsight.documentIds ?? []).slice(0, 2).forEach((documentId) => {
          const label = documentSourceMap.get(documentId);
          if (label) sources.push({ kind: "analysis", label, documentId });
        });
      }
      if (context.financial?.medicalBillsTotal) {
        parts.push(`Medical bills currently total $${context.financial.medicalBillsTotal.toLocaleString()}.`);
        sources.push({ kind: "financial", label: "Case financial totals" });
      }
      answer = parts.join(" ");
      break;
    }
  }

  if (sources.length === 0) {
    sources.push({ kind: "analysis", label: "Case timeline, providers, and routed documents" });
  }

  return {
    generatedAt: new Date().toISOString(),
    grounded: true,
    answer,
    warnings,
    sources,
  };
}
