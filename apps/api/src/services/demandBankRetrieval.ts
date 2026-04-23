import { prisma } from "../db/prisma";

export type DemandBankCaseProfile = {
  jurisdiction?: string | null;
  caseType?: string | null;
  liabilityType?: string | null;
  injuryTags?: string[];
  treatmentTags?: string[];
  bodyPartTags?: string[];
  mriPresent?: boolean | null;
  injectionsPresent?: boolean | null;
  surgeryPresent?: boolean | null;
  billsBand?: "low" | "medium" | "high" | null;
  templateFamily?: string | null;
  freeText?: string | null;
};

export type DemandBankMatch = {
  id: string;
  title: string;
  summary: string | null;
  redactedText: string | null;
  templateFamily: string | null;
  toneStyle: string | null;
  qualityScore: number | null;
  approvedForReuse: boolean;
  blockedForReuse: boolean;
  matterId: string | null;
  matchScore: number;
  matchReasons: string[];
};

export type DemandBankSectionMatch = {
  id: string;
  demandBankDocumentId: string;
  demandTitle: string;
  sectionType: string;
  heading: string | null;
  redactedText: string | null;
  approvedForReuse: boolean;
  matchScore: number;
  matchReasons: string[];
};

export type RetrieveDemandBankMatchesInput = {
  firmId: string;
  matterId?: string | null;
  runType: string;
  profile: DemandBankCaseProfile;
  templateId?: string | null;
  createdBy?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  limitDocuments?: number;
  limitSections?: number;
};

type ScoredValue<T> = {
  item: T;
  score: number;
  reasons: string[];
};

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeArray(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => trimToNull(value)?.toLowerCase() ?? "").filter(Boolean))];
}

function tokenize(value: string | null | undefined): string[] {
  const text = trimToNull(value)?.toLowerCase() ?? "";
  if (!text) return [];
  return [...new Set(text.split(/[^a-z0-9]+/).filter((token) => token.length > 2))];
}

function lexicalSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function normalizeBillsBand(amount: number | null | undefined): "low" | "medium" | "high" | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  if (amount < 10000) return "low";
  if (amount < 50000) return "medium";
  return "high";
}

function buildProfileText(profile: DemandBankCaseProfile): string {
  return [
    profile.jurisdiction,
    profile.caseType,
    profile.liabilityType,
    ...(profile.injuryTags ?? []),
    ...(profile.treatmentTags ?? []),
    ...(profile.bodyPartTags ?? []),
    profile.mriPresent === true ? "mri" : null,
    profile.injectionsPresent === true ? "injections" : null,
    profile.surgeryPresent === true ? "surgery" : null,
    profile.billsBand,
    profile.templateFamily,
    profile.freeText,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function scoreTagOverlap(label: string, requested: string[] | undefined, candidate: string[] | undefined) {
  const left = new Set(normalizeArray(requested));
  const right = new Set(normalizeArray(candidate));
  if (left.size === 0 || right.size === 0) {
    return { score: 0, reason: null as string | null };
  }

  const overlap = [...left].filter((value) => right.has(value));
  if (overlap.length === 0) {
    return { score: 0, reason: null as string | null };
  }

  return {
    score: overlap.length * 6,
    reason: `${label} overlap: ${overlap.join(", ")}`,
  };
}

export function scoreDemandBankDocumentCandidate(
  profile: DemandBankCaseProfile,
  candidate: {
    id: string;
    matterId: string | null;
    title: string;
    summary: string | null;
    redactedText: string | null;
    jurisdiction: string | null;
    caseType: string | null;
    liabilityType: string | null;
    injuryTags: string[];
    treatmentTags: string[];
    bodyPartTags: string[];
    mriPresent: boolean;
    injectionsPresent: boolean;
    surgeryPresent: boolean;
    totalBillsAmount: number | null;
    templateFamily: string | null;
    toneStyle: string | null;
    qualityScore: number | null;
    approvedForReuse: boolean;
    blockedForReuse: boolean;
  }
): ScoredValue<typeof candidate> {
  let score = 0;
  const reasons: string[] = [];

  if (trimToNull(profile.jurisdiction) && profile.jurisdiction === candidate.jurisdiction) {
    score += 18;
    reasons.push(`Jurisdiction match: ${candidate.jurisdiction}`);
  }
  if (trimToNull(profile.caseType) && profile.caseType === candidate.caseType) {
    score += 18;
    reasons.push(`Case type match: ${candidate.caseType}`);
  }
  if (trimToNull(profile.liabilityType) && profile.liabilityType === candidate.liabilityType) {
    score += 14;
    reasons.push(`Liability type match: ${candidate.liabilityType}`);
  }
  if (trimToNull(profile.templateFamily) && profile.templateFamily === candidate.templateFamily) {
    score += 10;
    reasons.push(`Template family match: ${candidate.templateFamily}`);
  }

  const injuryOverlap = scoreTagOverlap("Injury", profile.injuryTags, candidate.injuryTags);
  if (injuryOverlap.reason) {
    score += injuryOverlap.score;
    reasons.push(injuryOverlap.reason);
  }

  const treatmentOverlap = scoreTagOverlap("Treatment", profile.treatmentTags, candidate.treatmentTags);
  if (treatmentOverlap.reason) {
    score += treatmentOverlap.score;
    reasons.push(treatmentOverlap.reason);
  }

  const bodyPartOverlap = scoreTagOverlap("Body part", profile.bodyPartTags, candidate.bodyPartTags);
  if (bodyPartOverlap.reason) {
    score += bodyPartOverlap.score;
    reasons.push(bodyPartOverlap.reason);
  }

  if (profile.mriPresent === true && candidate.mriPresent) {
    score += 8;
    reasons.push("MRI presence match");
  }
  if (profile.injectionsPresent === true && candidate.injectionsPresent) {
    score += 8;
    reasons.push("Injection treatment match");
  }
  if (profile.surgeryPresent === true && candidate.surgeryPresent) {
    score += 10;
    reasons.push("Surgery match");
  }

  if (profile.billsBand && normalizeBillsBand(candidate.totalBillsAmount) === profile.billsBand) {
    score += 8;
    reasons.push(`Bills band match: ${profile.billsBand}`);
  }

  const lexicalScore = lexicalSimilarity(buildProfileText(profile), [candidate.summary, candidate.redactedText].filter(Boolean).join(" "));
  if (lexicalScore > 0) {
    score += Math.round(lexicalScore * 20);
    reasons.push(`Lexical similarity ${(lexicalScore * 100).toFixed(0)}%`);
  }

  if (typeof candidate.qualityScore === "number" && candidate.qualityScore > 0) {
    score += candidate.qualityScore;
    reasons.push(`Quality score boost ${candidate.qualityScore}`);
  }

  return { item: candidate, score, reasons };
}

function scoreDemandBankSectionCandidate(
  profile: DemandBankCaseProfile,
  candidate: {
    id: string;
    demandBankDocumentId: string;
    sectionType: string;
    heading: string | null;
    redactedText: string | null;
    approvedForReuse: boolean;
    qualityScore: number | null;
    document: {
      title: string;
      caseType: string | null;
      liabilityType: string | null;
      templateFamily: string | null;
    };
  }
): ScoredValue<typeof candidate> {
  let score = 0;
  const reasons: string[] = [];
  const desiredSectionTypes = new Set<string>();

  if (profile.liabilityType) desiredSectionTypes.add("liability");
  if ((profile.treatmentTags?.length ?? 0) > 0 || profile.mriPresent || profile.injectionsPresent || profile.surgeryPresent) {
    desiredSectionTypes.add("treatment_chronology");
    desiredSectionTypes.add("imaging");
    desiredSectionTypes.add("specialist_care");
  }
  if (profile.billsBand) desiredSectionTypes.add("bills_summary");

  if (desiredSectionTypes.has(candidate.sectionType)) {
    score += 10;
    reasons.push(`Section type aligned: ${candidate.sectionType}`);
  }

  if (trimToNull(profile.caseType) && profile.caseType === candidate.document.caseType) {
    score += 8;
    reasons.push(`Parent case type match: ${candidate.document.caseType}`);
  }
  if (trimToNull(profile.liabilityType) && profile.liabilityType === candidate.document.liabilityType) {
    score += 8;
    reasons.push(`Parent liability match: ${candidate.document.liabilityType}`);
  }
  if (trimToNull(profile.templateFamily) && profile.templateFamily === candidate.document.templateFamily) {
    score += 6;
    reasons.push(`Parent template family match: ${candidate.document.templateFamily}`);
  }

  const lexicalScore = lexicalSimilarity(buildProfileText(profile), [candidate.heading, candidate.redactedText].filter(Boolean).join(" "));
  if (lexicalScore > 0) {
    score += Math.round(lexicalScore * 22);
    reasons.push(`Lexical similarity ${(lexicalScore * 100).toFixed(0)}%`);
  }

  if (typeof candidate.qualityScore === "number" && candidate.qualityScore > 0) {
    score += candidate.qualityScore;
    reasons.push(`Section quality boost ${candidate.qualityScore}`);
  }

  return { item: candidate, score, reasons };
}

export async function retrieveDemandBankMatches(input: RetrieveDemandBankMatchesInput) {
  const limitDocuments = Math.max(1, Math.min(input.limitDocuments ?? 5, 10));
  const limitSections = Math.max(1, Math.min(input.limitSections ?? 8, 20));

  const [documents, sections] = await Promise.all([
    prisma.demandBankDocument.findMany({
      where: {
        firmId: input.firmId,
        approvedForReuse: true,
        blockedForReuse: false,
      },
      orderBy: [{ qualityScore: "desc" }, { reviewedAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.demandBankSection.findMany({
      where: {
        approvedForReuse: true,
        document: {
          firmId: input.firmId,
          approvedForReuse: true,
          blockedForReuse: false,
        },
      },
      include: {
        document: {
          select: {
            title: true,
            caseType: true,
            liabilityType: true,
            templateFamily: true,
          },
        },
      },
      orderBy: [{ qualityScore: "desc" }, { updatedAt: "desc" }],
      take: 200,
    }),
  ]);

  const scoredDocuments = documents
    .map((candidate) => scoreDemandBankDocumentCandidate(input.profile, candidate))
    .filter((candidate) => candidate.item.approvedForReuse && !candidate.item.blockedForReuse)
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limitDocuments);

  const allowedDocumentIds = new Set(scoredDocuments.map((candidate) => candidate.item.id));

  const scoredSections = sections
    .map((candidate) => scoreDemandBankSectionCandidate(input.profile, candidate))
    .filter((candidate) => candidate.item.approvedForReuse)
    .filter((candidate) => allowedDocumentIds.has(candidate.item.demandBankDocumentId) || candidate.score >= 12)
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limitSections);

  const run = await prisma.demandBankRun.create({
    data: {
      firmId: input.firmId,
      matterId: trimToNull(input.matterId),
      runType: input.runType,
      templateId: trimToNull(input.templateId),
      inputCaseProfile: input.profile,
      retrievedDemandIds: scoredDocuments.map((candidate) => candidate.item.id),
      retrievedSectionIds: scoredSections.map((candidate) => candidate.item.id),
      retrievalReasoning: {
        documents: scoredDocuments.map((candidate) => ({
          id: candidate.item.id,
          score: candidate.score,
          reasons: candidate.reasons,
        })),
        sections: scoredSections.map((candidate) => ({
          id: candidate.item.id,
          demandBankDocumentId: candidate.item.demandBankDocumentId,
          score: candidate.score,
          reasons: candidate.reasons,
        })),
      },
      model: trimToNull(input.model),
      promptVersion: trimToNull(input.promptVersion),
      createdBy: trimToNull(input.createdBy),
    },
  });

  return {
    runId: run.id,
    profile: input.profile,
    documents: scoredDocuments.map((candidate) => ({
      id: candidate.item.id,
      title: candidate.item.title,
      summary: candidate.item.summary,
      redactedText: candidate.item.redactedText,
      templateFamily: candidate.item.templateFamily,
      toneStyle: candidate.item.toneStyle,
      qualityScore: candidate.item.qualityScore,
      approvedForReuse: candidate.item.approvedForReuse,
      blockedForReuse: candidate.item.blockedForReuse,
      matterId: candidate.item.matterId,
      matchScore: candidate.score,
      matchReasons: candidate.reasons,
    })) as DemandBankMatch[],
    sections: scoredSections.map((candidate) => ({
      id: candidate.item.id,
      demandBankDocumentId: candidate.item.demandBankDocumentId,
      demandTitle: candidate.item.document.title,
      sectionType: candidate.item.sectionType,
      heading: candidate.item.heading,
      redactedText: candidate.item.redactedText,
      approvedForReuse: candidate.item.approvedForReuse,
      matchScore: candidate.score,
      matchReasons: candidate.reasons,
    })) as DemandBankSectionMatch[],
  };
}
