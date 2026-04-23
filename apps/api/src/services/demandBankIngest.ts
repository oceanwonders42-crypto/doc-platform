import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";

export type DemandBankSectionDraft = {
  sectionType: string;
  heading: string | null;
  originalText: string;
  redactedText: string | null;
};

export type DemandBankAnalysis = {
  title: string;
  summary: string | null;
  jurisdiction: string | null;
  caseType: string | null;
  liabilityType: string | null;
  injuryTags: string[];
  treatmentTags: string[];
  bodyPartTags: string[];
  mriPresent: boolean;
  injectionsPresent: boolean;
  surgeryPresent: boolean;
  treatmentDurationDays: number | null;
  totalBillsAmount: number | null;
  demandAmount: number | null;
  templateFamily: string | null;
  toneStyle: string | null;
  redactedText: string;
  sections: DemandBankSectionDraft[];
};

export type IngestDemandBankDocumentInput = {
  firmId: string;
  title?: string | null;
  fileName?: string | null;
  text?: string | null;
  matterId?: string | null;
  sourceDocumentId?: string | null;
  jurisdiction?: string | null;
  caseType?: string | null;
  liabilityType?: string | null;
  injuryTags?: string[] | null;
  treatmentTags?: string[] | null;
  bodyPartTags?: string[] | null;
  templateFamily?: string | null;
  toneStyle?: string | null;
  createdBy?: string | null;
};

const BODY_PART_PATTERNS: Array<[string, RegExp]> = [
  ["neck", /\bneck|cervical\b/i],
  ["back", /\bback|lumbar|thoracic\b/i],
  ["shoulder", /\bshoulder\b/i],
  ["knee", /\bknee\b/i],
  ["hip", /\bhip\b/i],
  ["head", /\bhead|headache|concussion\b/i],
  ["arm", /\barm|elbow|wrist|hand\b/i],
  ["leg", /\bleg|ankle|foot\b/i],
];

const INJURY_PATTERNS: Array<[string, RegExp]> = [
  ["strain/sprain", /\bstrain|sprain|whiplash\b/i],
  ["disc injury", /\bdisc|herniation|bulge|radiculopathy\b/i],
  ["fracture", /\bfracture|broken\b/i],
  ["soft tissue", /\bsoft tissue\b/i],
  ["concussion", /\bconcussion|tbi|traumatic brain\b/i],
  ["pain syndrome", /\bpain\b/i],
];

const TREATMENT_PATTERNS: Array<[string, RegExp]> = [
  ["physical therapy", /\bphysical therapy|\bpt\b/i],
  ["chiropractic", /\bchiropractic|chiropractor\b/i],
  ["pain management", /\bpain management\b/i],
  ["orthopedic", /\borthopedic|orthopaedic\b/i],
  ["neurology", /\bneurology|neurologist\b/i],
  ["imaging", /\bmri|ct scan|x-?ray\b/i],
  ["injection", /\binjection|epidural|esi|trigger point\b/i],
  ["surgery", /\bsurgery|operative|arthroscopy|fusion|discectomy|laminectomy\b/i],
];

const SECTION_TYPE_RULES: Array<{ type: string; pattern: RegExp }> = [
  { type: "intro", pattern: /\bintroduction|background|overview\b/i },
  { type: "liability", pattern: /\bliability|fault\b/i },
  { type: "mechanism", pattern: /\bmechanism|incident|collision|crash\b/i },
  { type: "treatment_chronology", pattern: /\btreatment chronology|treatment history|medical treatment|course of treatment\b/i },
  { type: "imaging", pattern: /\bimaging|radiology|mri|ct\b/i },
  { type: "specialist_care", pattern: /\bspecialist|pain management|orthopedic|neurology\b/i },
  { type: "bills_summary", pattern: /\bbills|specials|medical expenses|medical bills\b/i },
  { type: "pain_suffering", pattern: /\bpain and suffering|human damages|non-economic\b/i },
  { type: "permanency", pattern: /\bpermanency|permanent injury\b/i },
  { type: "future_care", pattern: /\bfuture care|future treatment|future medical\b/i },
  { type: "settlement_demand", pattern: /\bdemand|settlement\b/i },
  { type: "closing", pattern: /\bclosing|conclusion|resolve this claim|please contact\b/i },
];

const HEADING_PATTERN = /^[A-Z][A-Z0-9 ,/&()'".:-]{3,80}$/;

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").replace(/\t/g, " ").replace(/[ \f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeStringArray(values: Array<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => trimToNull(value)).filter((value): value is string => value !== null))];
}

function parseMoney(value: string | null | undefined): number | null {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeLikelyFinancialAmount(value: number | null): number | null {
  if (value == null) return null;
  return value >= 100 ? value : null;
}

function findMoneyAfterLabel(text: string, pattern: RegExp): number | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const expression = new RegExp(pattern.source, flags);
  const candidates: number[] = [];

  for (const match of text.matchAll(expression)) {
    const parsed = parseMoney(match[1] ?? null);
    if (parsed != null) {
      candidates.push(parsed);
    }
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function inferTreatmentDurationDays(text: string): number | null {
  const dayMatch = text.match(/\b(\d{1,4})\s+days?\s+of treatment\b/i);
  if (dayMatch) return Number(dayMatch[1]);

  const weekMatch = text.match(/\b(\d{1,3})\s+weeks?\s+of treatment\b/i);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  const monthMatch = text.match(/\b(\d{1,3})\s+months?\s+of treatment\b/i);
  if (monthMatch) return Number(monthMatch[1]) * 30;

  const yearMatch = text.match(/\b(\d{1,2})\s+years?\s+of treatment\b/i);
  if (yearMatch) return Number(yearMatch[1]) * 365;

  return null;
}

function inferToneStyle(text: string): string | null {
  if (/\bwe hereby demand|clear liability|must tender|without delay\b/i.test(text)) {
    return "assertive";
  }
  if (/\bplease|respectfully|we request\b/i.test(text)) {
    return "neutral";
  }
  return null;
}

function inferCaseType(text: string): string | null {
  if (/\bslip and fall|premises\b/i.test(text)) return "premises_liability";
  if (/\btruck|tractor trailer|commercial vehicle\b/i.test(text)) return "commercial_vehicle";
  if (/\bauto accident|motor vehicle|collision|rear-end|rear end|crash\b/i.test(text)) return "auto_collision";
  return null;
}

function inferLiabilityType(text: string): string | null {
  if (/\brear-end|rear end\b/i.test(text)) return "rear_end_collision";
  if (/\bslip and fall\b/i.test(text)) return "premises_liability";
  if (/\bnegligence\b/i.test(text)) return "general_negligence";
  return null;
}

function inferJurisdiction(text: string): string | null {
  const floridaMatch = text.match(/\bmiami-dade|broward|palm beach|florida\b/i);
  if (floridaMatch) return "Florida";
  const georgiaMatch = text.match(/\bgeorgia\b/i);
  if (georgiaMatch) return "Georgia";
  const texasMatch = text.match(/\btexas\b/i);
  if (texasMatch) return "Texas";
  return null;
}

function inferTemplateFamily(text: string): string | null {
  if (/\bresponse to offer\b/i.test(text)) return "offer_response";
  if (/\bresponse to denial\b/i.test(text)) return "denial_response";
  if (/\bdemand for settlement|settlement demand|policy limits\b/i.test(text)) return "pre_suit_demand";
  return "general_demand";
}

function redactExactPhrases(text: string, phrases: string[]): string {
  let nextText = text;
  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    nextText = nextText.replace(new RegExp(escaped, "gi"), "[REDACTED_NAME]");
  }
  return nextText;
}

export function redactDemandBankText(text: string, knownPhrases?: string[]): string {
  let nextText = normalizeWhitespace(text);
  nextText = redactExactPhrases(nextText, knownPhrases ?? []);
  nextText = nextText.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "[DATE]");
  nextText = nextText.replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/gi, "[DATE]");
  nextText = nextText.replace(/\$\s?\d[\d,]*(?:\.\d{2})?/g, "[AMOUNT]");
  nextText = nextText.replace(/\b(?:claim|policy|file|matter|case)\s*(?:number|no\.?|#)\s*[:\-]?\s*[A-Z0-9-]+\b/gi, "[REFERENCE]");
  nextText = nextText.replace(/\b\d{3}[-.)\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]");
  nextText = nextText.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
  nextText = nextText.replace(/\b\d{1,5}\s+[A-Z0-9.'-]+\s+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd)\b/gi, "[ADDRESS]");
  return nextText;
}

function detectTags(text: string, patterns: Array<[string, RegExp]>): string[] {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function inferSummary(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return null;
  const firstParagraph = normalized.split(/\n\n+/)[0] ?? normalized;
  const summary = firstParagraph.slice(0, 320).trim();
  return summary.length > 0 ? summary : null;
}

function deriveSectionType(heading: string | null): string {
  if (!heading) return "other";
  const rule = SECTION_TYPE_RULES.find((candidate) => candidate.pattern.test(heading));
  return rule?.type ?? "other";
}

export function splitDemandBankSections(text: string, knownPhrases?: string[]): DemandBankSectionDraft[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const sections: Array<{ heading: string | null; lines: string[] }> = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };

  const pushCurrent = () => {
    const content = normalizeWhitespace(current.lines.join("\n"));
    if (!content) return;
    sections.push({ heading: current.heading, lines: [content] });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      current.lines.push("");
      continue;
    }

    const looksLikeHeading =
      HEADING_PATTERN.test(line) ||
      (/^[A-Z][A-Za-z0-9 ,/&()'".:-]{3,80}:$/.test(line) && !line.includes("  "));

    if (looksLikeHeading && current.lines.length > 0) {
      pushCurrent();
      current = { heading: line.replace(/:$/, ""), lines: [] };
      continue;
    }

    if (looksLikeHeading && current.lines.length === 0 && current.heading == null) {
      current.heading = line.replace(/:$/, "");
      continue;
    }

    current.lines.push(line);
  }

  pushCurrent();

  const mapped = sections.map((section) => {
    const originalText = normalizeWhitespace(section.lines.join("\n"));
    return {
      heading: section.heading,
      sectionType: deriveSectionType(section.heading),
      originalText,
      redactedText: redactDemandBankText(originalText, knownPhrases),
    };
  });

  if (mapped.length > 0) return mapped;

  return [
    {
      sectionType: "other",
      heading: null,
      originalText: normalized,
      redactedText: redactDemandBankText(normalized, knownPhrases),
    },
  ];
}

export function analyzeDemandBankText(
  text: string,
  options?: {
    title?: string | null;
    knownPhrases?: string[];
    jurisdiction?: string | null;
    caseType?: string | null;
    liabilityType?: string | null;
    injuryTags?: string[] | null;
    treatmentTags?: string[] | null;
    bodyPartTags?: string[] | null;
    templateFamily?: string | null;
    toneStyle?: string | null;
  }
): DemandBankAnalysis {
  const normalized = normalizeWhitespace(text);
  const redactedText = redactDemandBankText(normalized, options?.knownPhrases);
  const sections = splitDemandBankSections(normalized, options?.knownPhrases);
  const firstLine = normalized.split("\n")[0] ?? "Demand Bank Document";
  const title = trimToNull(options?.title) ?? trimToNull(firstLine)?.slice(0, 120) ?? "Demand Bank Document";

  const injuryTags = normalizeStringArray([
    ...detectTags(normalized, INJURY_PATTERNS),
    ...(options?.injuryTags ?? []),
  ]);
  const treatmentTags = normalizeStringArray([
    ...detectTags(normalized, TREATMENT_PATTERNS),
    ...(options?.treatmentTags ?? []),
  ]);
  const bodyPartTags = normalizeStringArray([
    ...detectTags(normalized, BODY_PART_PATTERNS),
    ...(options?.bodyPartTags ?? []),
  ]);

  const totalBillsAmount = normalizeLikelyFinancialAmount(
    findMoneyAfterLabel(normalized, /\b(?:medical bills|specials|past medical expenses|total medical expenses)\b[^$\d]{0,40}(\$?\s?\d[\d,]*(?:\.\d{2})?)/i) ??
      null
  );
  const demandAmount = normalizeLikelyFinancialAmount(
    findMoneyAfterLabel(normalized, /\b(?:settlement demand|total demand|policy limits demand|we hereby demand)\b[^$\d]{0,50}(\$?\s?\d[\d,]*(?:\.\d{2})?)/i) ??
      null
  );

  return {
    title,
    summary: inferSummary(redactedText),
    jurisdiction: trimToNull(options?.jurisdiction) ?? inferJurisdiction(normalized),
    caseType: trimToNull(options?.caseType) ?? inferCaseType(normalized),
    liabilityType: trimToNull(options?.liabilityType) ?? inferLiabilityType(normalized),
    injuryTags,
    treatmentTags,
    bodyPartTags,
    mriPresent: /\bmri\b/i.test(normalized),
    injectionsPresent: /\binjection|epidural|esi|trigger point\b/i.test(normalized),
    surgeryPresent: /\bsurgery|operative|arthroscopy|fusion|discectomy|laminectomy\b/i.test(normalized),
    treatmentDurationDays: inferTreatmentDurationDays(normalized),
    totalBillsAmount,
    demandAmount,
    templateFamily: trimToNull(options?.templateFamily) ?? inferTemplateFamily(normalized),
    toneStyle: trimToNull(options?.toneStyle) ?? inferToneStyle(normalized),
    redactedText,
    sections,
  };
}

async function getSourceDocumentText(
  firmId: string,
  sourceDocumentId: string
): Promise<{ originalName: string | null; routedCaseId: string | null; text: string | null }> {
  const document = await prisma.document.findFirst({
    where: { id: sourceDocumentId, firmId },
    select: {
      id: true,
      originalName: true,
      routedCaseId: true,
    },
  });

  if (!document) {
    throw new Error("Source document not found");
  }

  const recognitionResult = await pgPool.query<{ text_excerpt: string | null }>(
    `select text_excerpt from document_recognition where document_id = $1`,
    [sourceDocumentId]
  );

  return {
    originalName: document.originalName ?? null,
    routedCaseId: document.routedCaseId ?? null,
    text: recognitionResult.rows[0]?.text_excerpt ?? null,
  };
}

async function validateMatterId(firmId: string, matterId: string | null): Promise<string | null> {
  if (!matterId) return null;
  const matter = await prisma.legalCase.findFirst({
    where: { id: matterId, firmId },
    select: { id: true },
  });
  if (!matter) {
    throw new Error("Matter not found");
  }
  return matter.id;
}

export async function ingestDemandBankDocument(input: IngestDemandBankDocumentInput) {
  const sourceDocumentId = trimToNull(input.sourceDocumentId);
  const directText = trimToNull(input.text);
  let sourceDocumentName: string | null = trimToNull(input.fileName);
  let inferredMatterId: string | null = trimToNull(input.matterId);
  let sourceText = directText;
  const knownPhrases: string[] = [];

  if (sourceDocumentId) {
    const sourceDocument = await getSourceDocumentText(input.firmId, sourceDocumentId);
    if (!sourceText) {
      sourceText = trimToNull(sourceDocument.text);
    }
    if (!sourceDocumentName) {
      sourceDocumentName = sourceDocument.originalName;
    }
    if (!inferredMatterId && sourceDocument.routedCaseId) {
      inferredMatterId = sourceDocument.routedCaseId;
    }
  }

  if (!sourceText) {
    throw new Error("Demand text is required or the source document must already have extracted text.");
  }

  const matterId = await validateMatterId(input.firmId, inferredMatterId);
  if (matterId) {
    const matter = await prisma.legalCase.findFirst({
      where: { id: matterId, firmId: input.firmId },
      select: { clientName: true, caseNumber: true, title: true },
    });
    knownPhrases.push(
      ...(matter
        ? [matter.clientName ?? null, matter.caseNumber ?? null, matter.title ?? null].filter(
            (value): value is string => Boolean(trimToNull(value))
          )
        : [])
    );
  }

  const analysis = analyzeDemandBankText(sourceText, {
    title: input.title,
    knownPhrases,
    jurisdiction: input.jurisdiction,
    caseType: input.caseType,
    liabilityType: input.liabilityType,
    injuryTags: input.injuryTags,
    treatmentTags: input.treatmentTags,
    bodyPartTags: input.bodyPartTags,
    templateFamily: input.templateFamily,
    toneStyle: input.toneStyle,
  });

  const created = await prisma.demandBankDocument.create({
    data: {
      firmId: input.firmId,
      matterId,
      sourceDocumentId,
      title: analysis.title,
      fileName: sourceDocumentName,
      originalText: normalizeWhitespace(sourceText),
      redactedText: analysis.redactedText,
      summary: analysis.summary,
      jurisdiction: analysis.jurisdiction,
      caseType: analysis.caseType,
      liabilityType: analysis.liabilityType,
      injuryTags: analysis.injuryTags,
      treatmentTags: analysis.treatmentTags,
      bodyPartTags: analysis.bodyPartTags,
      mriPresent: analysis.mriPresent,
      injectionsPresent: analysis.injectionsPresent,
      surgeryPresent: analysis.surgeryPresent,
      treatmentDurationDays: analysis.treatmentDurationDays,
      totalBillsAmount: analysis.totalBillsAmount,
      demandAmount: analysis.demandAmount,
      templateFamily: analysis.templateFamily,
      toneStyle: analysis.toneStyle,
      reviewStatus: "pending",
      createdBy: trimToNull(input.createdBy),
      sections: {
        create: analysis.sections.map((section) => ({
          sectionType: section.sectionType,
          heading: section.heading,
          originalText: section.originalText,
          redactedText: section.redactedText,
          approvedForReuse: false,
        })),
      },
    },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return {
    item: created,
    sectionCount: created.sections.length,
  };
}
