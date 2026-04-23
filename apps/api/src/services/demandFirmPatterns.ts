import { prisma } from "../db/prisma";

export type DemandPatternNarrativeType =
  | "treatment_summary"
  | "injury_summary"
  | "pain_suffering"
  | "liability"
  | "demand_rationale"
  | "response_to_denial"
  | "response_to_offer";

export type FirmDemandPattern = {
  id: string;
  sourceDocumentId: string;
  sourceTitle: string;
  sectionType: string;
  heading: string | null;
  redactedText: string;
  qualityScore: number | null;
};

const sectionTypePreferences: Record<DemandPatternNarrativeType, string[]> = {
  treatment_summary: ["treatment_summary", "treatment", "medical_treatment", "chronology"],
  injury_summary: ["injury_summary", "summary", "injuries", "injury"],
  pain_suffering: ["pain_suffering", "damages", "general_damages"],
  liability: ["liability", "liability_summary"],
  demand_rationale: ["demand_rationale", "settlement", "settlement_demand", "closing"],
  response_to_denial: ["response_to_denial", "liability", "demand_rationale"],
  response_to_offer: ["response_to_offer", "settlement", "demand_rationale"],
};

function normalizeSectionType(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export async function getFirmDemandPatterns(input: {
  firmId: string;
  narrativeType: DemandPatternNarrativeType;
  limit?: number;
}): Promise<FirmDemandPattern[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 2, 4));
  const preferredTypes = new Set(sectionTypePreferences[input.narrativeType].map((value) => normalizeSectionType(value)));

  const candidates = await prisma.demandBankSection.findMany({
    where: {
      redactedText: { not: null },
      document: {
        firmId: input.firmId,
        blockedForReuse: false,
      },
    },
    orderBy: [
      { qualityScore: "desc" },
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: limit * 8,
    select: {
      id: true,
      sectionType: true,
      heading: true,
      redactedText: true,
      qualityScore: true,
      approvedForReuse: true,
      document: {
        select: {
          id: true,
          title: true,
          approvedForReuse: true,
        },
      },
    },
  });

  const approved = candidates.filter((candidate) => {
    const text = candidate.redactedText?.trim();
    return Boolean(text) && (candidate.approvedForReuse || candidate.document.approvedForReuse);
  });

  const preferred = approved.filter((candidate) =>
    preferredTypes.has(normalizeSectionType(candidate.sectionType))
  );
  const selected = (preferred.length > 0 ? preferred : approved).slice(0, limit);

  return selected.map((candidate) => ({
    id: candidate.id,
    sourceDocumentId: candidate.document.id,
    sourceTitle: candidate.document.title,
    sectionType: candidate.sectionType,
    heading: candidate.heading?.trim() || null,
    redactedText: candidate.redactedText?.trim() ?? "",
    qualityScore: candidate.qualityScore ?? null,
  }));
}

export function buildFirmDemandPatternsPromptBlock(patterns: FirmDemandPattern[]): string {
  if (patterns.length === 0) return "";

  const patternBlocks = patterns.map((pattern, index) =>
    [
      `Pattern ${index + 1}: ${pattern.sectionType}${pattern.heading ? ` (${pattern.heading})` : ""} from ${pattern.sourceTitle}`,
      "Why selected: approved reusable section from this firm's prior reviewed drafting history.",
      pattern.redactedText.slice(0, 500),
    ]
      .filter(Boolean)
      .join("\n")
  );

  return [
    "## Same-firm approved drafting patterns (style and structure only)",
    "These are approved, redacted examples from this firm's prior work. They are never current-case facts and must not be copied as facts into this matter.",
    ...patternBlocks,
  ].join("\n\n");
}
