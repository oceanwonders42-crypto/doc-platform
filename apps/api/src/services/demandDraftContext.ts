import { prisma } from "../db/prisma";
import { analyzeDemandBankText } from "./demandBankIngest";
import {
  retrieveDemandBankMatches,
  type DemandBankCaseProfile,
} from "./demandBankRetrieval";

export type DemandDraftTemplateInfo = {
  narrativeType: string;
  tone: string;
  templateFamilyPreference?: string | null;
};

export type DemandDraftContext = {
  currentCase: {
    caseId: string;
    firmId: string;
    title: string | null;
    caseNumber: string | null;
    clientName: string | null;
    notes: string | null;
    summary: string | null;
    financials: {
      medicalBillsTotal: number | null;
      liensTotal: number | null;
      settlementOffer: number | null;
    };
    providers: Array<{ name: string | null; specialty: string | null }>;
    timeline: Array<{
      eventDate: string | null;
      eventType: string | null;
      track: string | null;
      provider: string | null;
      diagnosis: string | null;
      procedure: string | null;
      amount: string | null;
    }>;
  };
  selectedTemplate: DemandDraftTemplateInfo | null;
  caseProfile: DemandBankCaseProfile;
  retrievedExamples: Array<{
    id: string;
    title: string;
    exampleOnly: true;
    summary: string | null;
    redactedText: string | null;
    templateFamily: string | null;
    toneStyle: string | null;
    matchScore: number;
    matchReasons: string[];
  }>;
  retrievedSections: Array<{
    id: string;
    demandBankDocumentId: string;
    demandTitle: string;
    sectionType: string;
    heading: string | null;
    exampleOnly: true;
    redactedText: string | null;
    matchScore: number;
    matchReasons: string[];
  }>;
  retrievalRunId: string | null;
  rules: {
    currentCaseFactsAreSourceOfTruth: true;
    priorDemandsAreExamplesOnly: true;
    neverCopyFactsFromPriorMatters: true;
    markMissingFacts: true;
    doNotInvent: string[];
  };
};

type BuildDemandDraftContextInput = {
  caseId: string;
  firmId: string;
  template: DemandDraftTemplateInfo;
  createdBy?: string | null;
  model?: string | null;
  promptVersion?: string | null;
};

function formatDate(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function buildBillsBand(value: number | null | undefined): "low" | "medium" | "high" | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value < 10000) return "low";
  if (value < 50000) return "medium";
  return "high";
}

function buildCaseProfileText(input: {
  title: string | null;
  notes: string | null;
  summary: string | null;
  providers: Array<{ name: string | null; specialty: string | null }>;
  timeline: Array<{
    eventType: string | null;
    provider: string | null;
    diagnosis: string | null;
    procedure: string | null;
    amount: string | null;
  }>;
}) {
  const providerText = input.providers
    .map((provider) => [provider.name, provider.specialty].filter(Boolean).join(" "))
    .join("\n");
  const timelineText = input.timeline
    .map((event) =>
      [event.eventType, event.provider, event.diagnosis, event.procedure, event.amount]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");

  return [input.title, input.notes, input.summary, providerText, timelineText]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n\n");
}

export async function buildDemandDraftContext(
  input: BuildDemandDraftContextInput
): Promise<DemandDraftContext> {
  const [legalCase, caseSummary, caseFinancial, providers, timeline] = await Promise.all([
    prisma.legalCase.findFirst({
      where: { id: input.caseId, firmId: input.firmId },
      select: {
        id: true,
        title: true,
        caseNumber: true,
        clientName: true,
        notes: true,
      },
    }),
    prisma.caseSummary.findFirst({
      where: { caseId: input.caseId, firmId: input.firmId },
      select: { body: true },
    }),
    prisma.caseFinancial.findFirst({
      where: { caseId: input.caseId, firmId: input.firmId },
      select: {
        medicalBillsTotal: true,
        liensTotal: true,
        settlementOffer: true,
      },
    }),
    prisma.caseProvider.findMany({
      where: { caseId: input.caseId, firmId: input.firmId },
      include: {
        provider: {
          select: {
            name: true,
            specialty: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.caseTimelineEvent.findMany({
      where: { caseId: input.caseId, firmId: input.firmId },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      take: 40,
      select: {
        eventDate: true,
        eventType: true,
        track: true,
        provider: true,
        diagnosis: true,
        procedure: true,
        amount: true,
      },
    }),
  ]);

  if (!legalCase) {
    throw new Error("Case not found");
  }

  const providerList = providers.map((row) => ({
    name: row.provider?.name ?? null,
    specialty: row.provider?.specialty ?? null,
  }));

  const timelineItems = timeline.map((event) => ({
    eventDate: formatDate(event.eventDate),
    eventType: event.eventType,
    track: event.track,
    provider: event.provider,
    diagnosis: event.diagnosis,
    procedure: event.procedure,
    amount: event.amount,
  }));

  const profileAnalysis = analyzeDemandBankText(
    buildCaseProfileText({
      title: legalCase.title ?? null,
      notes: legalCase.notes ?? null,
      summary: caseSummary?.body ?? null,
      providers: providerList,
      timeline: timelineItems,
    }),
    {
      title: legalCase.title ?? legalCase.caseNumber ?? input.caseId,
      templateFamily: input.template.templateFamilyPreference ?? null,
    }
  );

  const caseProfile: DemandBankCaseProfile = {
    jurisdiction: profileAnalysis.jurisdiction,
    caseType: profileAnalysis.caseType,
    liabilityType: profileAnalysis.liabilityType,
    injuryTags: profileAnalysis.injuryTags,
    treatmentTags: profileAnalysis.treatmentTags,
    bodyPartTags: profileAnalysis.bodyPartTags,
    mriPresent: profileAnalysis.mriPresent,
    injectionsPresent: profileAnalysis.injectionsPresent,
    surgeryPresent: profileAnalysis.surgeryPresent,
    billsBand: buildBillsBand(caseFinancial?.medicalBillsTotal ?? null),
    templateFamily: input.template.templateFamilyPreference ?? profileAnalysis.templateFamily,
    freeText: [caseSummary?.body ?? null, legalCase.notes ?? null]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n\n"),
  };

  const retrieval = await retrieveDemandBankMatches({
    firmId: input.firmId,
    matterId: input.caseId,
    runType: "draft_context_build",
    profile: caseProfile,
    templateId: input.template.templateFamilyPreference ?? null,
    createdBy: input.createdBy ?? null,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    limitDocuments: 3,
    limitSections: 6,
  });

  return {
    currentCase: {
      caseId: input.caseId,
      firmId: input.firmId,
      title: legalCase.title ?? null,
      caseNumber: legalCase.caseNumber ?? null,
      clientName: legalCase.clientName ?? null,
      notes: legalCase.notes ?? null,
      summary: caseSummary?.body ?? null,
      financials: {
        medicalBillsTotal: caseFinancial?.medicalBillsTotal ?? null,
        liensTotal: caseFinancial?.liensTotal ?? null,
        settlementOffer: caseFinancial?.settlementOffer ?? null,
      },
      providers: providerList,
      timeline: timelineItems,
    },
    selectedTemplate: input.template,
    caseProfile,
    retrievedExamples: retrieval.documents.map((item) => ({
      id: item.id,
      title: item.title,
      exampleOnly: true as const,
      summary: item.summary,
      redactedText: item.redactedText,
      templateFamily: item.templateFamily,
      toneStyle: item.toneStyle,
      matchScore: item.matchScore,
      matchReasons: item.matchReasons,
    })),
    retrievedSections: retrieval.sections.map((section) => ({
      id: section.id,
      demandBankDocumentId: section.demandBankDocumentId,
      demandTitle: section.demandTitle,
      sectionType: section.sectionType,
      heading: section.heading,
      exampleOnly: true as const,
      redactedText: section.redactedText,
      matchScore: section.matchScore,
      matchReasons: section.matchReasons,
    })),
    retrievalRunId: retrieval.runId,
    rules: {
      currentCaseFactsAreSourceOfTruth: true,
      priorDemandsAreExamplesOnly: true,
      neverCopyFactsFromPriorMatters: true,
      markMissingFacts: true,
      doNotInvent: [
        "providers",
        "bills",
        "dates",
        "diagnoses",
        "treatment events",
        "demand values",
      ],
    },
  };
}

export function buildDemandDraftExamplesPromptBlock(context: DemandDraftContext): string {
  const exampleBlocks = context.retrievedExamples.slice(0, 2).map((example, index) => {
    const text = (example.redactedText ?? example.summary ?? "").trim().slice(0, 900);
    return [
      `Example ${index + 1}: ${example.title}`,
      `Why selected: ${example.matchReasons.join("; ") || "approved reusable demand example"}`,
      text,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const sectionBlocks = context.retrievedSections.slice(0, 4).map((section, index) => {
    const text = (section.redactedText ?? "").trim().slice(0, 500);
    return [
      `Section ${index + 1}: ${section.sectionType}${section.heading ? ` (${section.heading})` : ""} from ${section.demandTitle}`,
      `Why selected: ${section.matchReasons.join("; ") || "approved reusable section"}`,
      text,
    ]
      .filter(Boolean)
      .join("\n");
  });

  if (exampleBlocks.length === 0 && sectionBlocks.length === 0) {
    return "";
  }

  return [
    "## Approved prior-demand examples (style and structure only)",
    "These are prior approved examples. They are not current-case facts and must never be treated as facts for this matter.",
    ...exampleBlocks,
    ...sectionBlocks,
  ].join("\n\n");
}
