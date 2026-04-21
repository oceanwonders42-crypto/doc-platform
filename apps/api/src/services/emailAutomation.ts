import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

type EmailAutomationFieldKey =
  | "clientName"
  | "dateOfLoss"
  | "claimNumber"
  | "insuranceCarrier";

export type EmailAutomationField = {
  value: string;
  confidence: number;
  sources: string[];
};

export type EmailAutomationSnapshot = {
  version: "email_automation_v1";
  extractedAt: string;
  source: {
    fromEmail: string | null;
    subject: string | null;
    attachmentFileName: string | null;
    attachmentNames: string[];
  };
  fields: {
    clientName: EmailAutomationField | null;
    dateOfLoss: EmailAutomationField | null;
    claimNumber: EmailAutomationField | null;
    insuranceCarrier: EmailAutomationField | null;
  };
  matchSignals: {
    caseNumberCandidates: string[];
    clientNameCandidates: string[];
    supportingSignals: string[];
  };
};

export type EmailAutomationInput = {
  fromEmail?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  attachmentFileName?: string | null;
  attachmentNames?: Array<string | null | undefined>;
};

type Candidate = {
  value: string;
  confidence: number;
  source: string;
};

const CARRIER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bstate\s*farm\b/i, label: "State Farm" },
  { pattern: /\bgeico\b/i, label: "GEICO" },
  { pattern: /\bprogressive\b/i, label: "Progressive" },
  { pattern: /\ballstate\b/i, label: "Allstate" },
  { pattern: /\bliberty\s*mutual\b/i, label: "Liberty Mutual" },
  { pattern: /\bnationwide\b/i, label: "Nationwide" },
  { pattern: /\btravelers\b/i, label: "Travelers" },
  { pattern: /\bfarmers\b/i, label: "Farmers" },
  { pattern: /\busaa\b/i, label: "USAA" },
  { pattern: /\bmercury\b/i, label: "Mercury" },
];

function normalizeWhitespace(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function titleCaseName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function normalizeFieldValue(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeIdentifier(value: string): string {
  return value.trim().replace(/[^\w\-/.]/g, "").slice(0, 120);
}

function normalizeCaseIdentifier(value: string): string | null {
  const normalized = normalizeFieldValue(normalizeIdentifier(value));
  if (!normalized) return null;
  return /\d/.test(normalized) ? normalized : null;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeFieldValue(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function scoreField(candidates: Candidate[]): EmailAutomationField | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((left, right) => right.confidence - left.confidence);
  const best = sorted[0]!;
  return {
    value: best.value,
    confidence: Number(best.confidence.toFixed(2)),
    sources: dedupeStrings(sorted.map((candidate) => candidate.source)),
  };
}

function collectCandidates(
  source: string,
  text: string,
  regex: RegExp,
  confidence: number,
  normalize: (value: string) => string | null = normalizeFieldValue
): Candidate[] {
  const matches = [...text.matchAll(regex)];
  return matches
    .map((match) => normalize(match[1] ?? ""))
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => ({ value, confidence, source }));
}

function extractClientNameCandidates(input: EmailAutomationInput): Candidate[] {
  const candidates: Candidate[] = [];
  const subject = normalizeWhitespace(input.subject);
  const bodyText = normalizeWhitespace(input.bodyText);
  const attachmentNames = dedupeStrings(input.attachmentNames ?? []);
  const fromEmail = normalizeWhitespace(input.fromEmail);

  if (subject) {
    const subjectPatterns = [
      {
        regex: /\bclient\s*[:\-]\s*([A-Z][A-Za-z'.]+(?:-[A-Z][A-Za-z'.]+)?(?:\s+[A-Z][A-Za-z'.]+(?:-[A-Z][A-Za-z'.]+)?){1,3})(?=\s*(?:-|(?:claim(?:\s+number)?|claim\s*#|date\s+of\s+loss|dol|insurance\s+carrier|carrier)\b)|$)/gi,
        confidence: 0.84,
      },
      {
        regex: /\binsured\s*[:\-]\s*([A-Z][A-Za-z'.]+(?:-[A-Z][A-Za-z'.]+)?(?:\s+[A-Z][A-Za-z'.]+(?:-[A-Z][A-Za-z'.]+)?){1,3})(?=\s*(?:-|(?:claim(?:\s+number)?|claim\s*#|date\s+of\s+loss|dol|insurance\s+carrier|carrier)\b)|$)/gi,
        confidence: 0.8,
      },
      {
        regex: /^re:\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3})/gi,
        confidence: 0.66,
      },
      {
        regex: /^fwd?:\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3})/gi,
        confidence: 0.64,
      },
    ];
    for (const entry of subjectPatterns) {
      candidates.push(
        ...collectCandidates("subject", subject, entry.regex, entry.confidence, (value) => {
          const normalized = normalizeFieldValue(value);
          return normalized ? titleCaseName(normalized.replace(/^[,.\-]+|[,.\-]+$/g, "")) : null;
        })
      );
    }
  }

  if (bodyText) {
    candidates.push(
      ...collectCandidates(
        "body",
        bodyText,
        /\b(?:client|claimant|insured|patient)\s*[:\-]\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3}?)(?=\s+(?:date\s+of\s+loss|loss\s+date|dol|claim(?:\s+number)?|claim\s*#|insurance\s+carrier|carrier)\b|$)/gi,
        0.9,
        (value) => {
          const normalized = normalizeFieldValue(value);
          return normalized ? titleCaseName(normalized.replace(/^[,.\-]+|[,.\-]+$/g, "")) : null;
        }
      )
    );
  }

  for (const attachmentName of attachmentNames) {
    const normalizedName = attachmentName.replace(/\.[a-z0-9]+$/i, " ").replace(/[_-]+/g, " ");
    candidates.push(
      ...collectCandidates(
        "attachment",
        normalizedName,
        /\b([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){1,2})\b/g,
        0.55,
        (value) => {
          const normalized = normalizeFieldValue(value);
          if (!normalized) return null;
          const trimmed = normalizeWhitespace(
            normalized.replace(/\b(?:dol|claim|policy|carrier|insurance)\b.*$/i, "")
          );
          if (!trimmed) return null;
          if (/\b(invoice|records|medical|document|claim|carrier|insurance|summary)\b/i.test(trimmed)) {
            return null;
          }
          return titleCaseName(trimmed);
        }
      )
    );
  }

  if (fromEmail) {
    const localPart = fromEmail.split("@")[0] ?? "";
    const senderName = normalizeWhitespace(localPart.replace(/[._-]+/g, " "));
    if (/^[a-z]{2,}\s+[a-z]{2,}(?:\s+[a-z]{2,})?$/.test(senderName)) {
      candidates.push({
        value: titleCaseName(senderName),
        confidence: 0.42,
        source: "sender",
      });
    }
  }

  return candidates;
}

function extractCarrierCandidates(input: EmailAutomationInput): Candidate[] {
  const candidates: Candidate[] = [];
  const textSources = [
    { source: "subject", text: normalizeWhitespace(input.subject), confidence: 0.68 },
    { source: "body", text: normalizeWhitespace(input.bodyText), confidence: 0.86 },
    {
      source: "attachment",
      text: dedupeStrings(input.attachmentNames ?? []).join(" "),
      confidence: 0.55,
    },
    { source: "sender", text: normalizeWhitespace(input.fromEmail), confidence: 0.5 },
  ];

  for (const entry of textSources) {
    if (!entry.text) continue;
    candidates.push(
      ...collectCandidates(
        entry.source,
        entry.text,
        /\b(?:carrier|insurance carrier|insurer|insurance company)\s*[:\-]\s*([A-Za-z0-9&.,' -]{3,80})/gi,
        entry.confidence,
        (value) => normalizeFieldValue(value)?.replace(/[;,]+$/, "") ?? null
      )
    );
    for (const carrier of CARRIER_PATTERNS) {
      if (carrier.pattern.test(entry.text)) {
        candidates.push({
          value: carrier.label,
          confidence: entry.confidence,
          source: entry.source,
        });
      }
    }
  }

  return candidates;
}

export function extractEmailAutomationSnapshot(
  input: EmailAutomationInput
): EmailAutomationSnapshot | null {
  const subject = normalizeFieldValue(input.subject);
  const bodyText = normalizeWhitespace(input.bodyText);
  const fromEmail = normalizeFieldValue(input.fromEmail);
  const attachmentFileName = normalizeFieldValue(input.attachmentFileName);
  const attachmentNames = dedupeStrings(input.attachmentNames ?? []);
  const attachmentSearchText = attachmentNames
    .map((name) => name.replace(/\.[a-z0-9]+$/i, " ").replace(/_+/g, " "))
    .join(" ");

  if (!subject && !bodyText && !fromEmail && attachmentNames.length === 0) {
    return null;
  }

  const claimNumber = scoreField([
    ...collectCandidates(
      "subject",
      subject ?? "",
      /\b(?:claim(?:\s+number)?|claim\s*#|file\s+number|reference\s+number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.8,
      normalizeCaseIdentifier
    ),
    ...collectCandidates(
      "body",
      bodyText,
      /\b(?:claim(?:\s+number)?|claim\s*#|file\s+number|reference\s+number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.92,
      normalizeCaseIdentifier
    ),
    ...collectCandidates(
      "attachment",
      attachmentSearchText,
      /\b(?:claim(?:\s+number)?|claim\s*#|file\s+number|reference\s+number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.58,
      normalizeCaseIdentifier
    ),
  ]);

  const dateOfLoss = scoreField([
    ...collectCandidates(
      "subject",
      subject ?? "",
      /\b(?:date of loss|dol|incident date|accident date)\s*[:#-]?\s*([A-Za-z0-9,/-]{6,30})/gi,
      0.74
    ),
    ...collectCandidates(
      "body",
      bodyText,
      /\b(?:date of loss|dol|incident date|accident date)\s*[:#-]?\s*([A-Za-z0-9,/-]{6,30})/gi,
      0.9
    ),
    ...collectCandidates(
      "attachment",
      attachmentSearchText,
      /\b(?:date of loss|dol|incident date|accident date)\s*[:#-]?\s*([A-Za-z0-9,/-]{6,30})/gi,
      0.56
    ),
  ]);

  const clientName = scoreField(extractClientNameCandidates(input));
  const insuranceCarrier = scoreField(extractCarrierCandidates(input));

  const fields = {
    clientName,
    dateOfLoss,
    claimNumber,
    insuranceCarrier,
  };

  const supportingSignals = dedupeStrings([
    claimNumber ? `claim number (${Math.round(claimNumber.confidence * 100)}%)` : null,
    clientName ? `client name (${Math.round(clientName.confidence * 100)}%)` : null,
    dateOfLoss ? `date of loss (${Math.round(dateOfLoss.confidence * 100)}%)` : null,
    insuranceCarrier ? `insurance carrier (${Math.round(insuranceCarrier.confidence * 100)}%)` : null,
  ]);

  if (!supportingSignals.length) {
    return null;
  }

  return {
    version: "email_automation_v1",
    extractedAt: new Date().toISOString(),
    source: {
      fromEmail,
      subject,
      attachmentFileName,
      attachmentNames,
    },
    fields,
    matchSignals: {
      caseNumberCandidates: dedupeStrings([claimNumber?.value]),
      clientNameCandidates: dedupeStrings([clientName?.value]),
      supportingSignals,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getDocumentEmailAutomation(metaJson: unknown): EmailAutomationSnapshot | null {
  const meta = asRecord(metaJson);
  const raw = asRecord(meta?.emailAutomation);
  if (!raw) return null;

  const source = asRecord(raw.source);
  const fields = asRecord(raw.fields);
  const matchSignals = asRecord(raw.matchSignals);

  const parseField = (key: EmailAutomationFieldKey): EmailAutomationField | null => {
    const field = asRecord(fields?.[key]);
    const value = normalizeFieldValue(typeof field?.value === "string" ? field.value : null);
    const confidence =
      typeof field?.confidence === "number" && Number.isFinite(field.confidence)
        ? field.confidence
        : null;
    const sources = Array.isArray(field?.sources)
      ? field.sources.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
    if (!value || confidence == null) return null;
    return { value, confidence, sources };
  };

  const supportingSignals = Array.isArray(matchSignals?.supportingSignals)
    ? matchSignals.supportingSignals.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
      )
    : [];
  const caseNumberCandidates = Array.isArray(matchSignals?.caseNumberCandidates)
    ? matchSignals.caseNumberCandidates.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
      )
    : [];
  const clientNameCandidates = Array.isArray(matchSignals?.clientNameCandidates)
    ? matchSignals.clientNameCandidates.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
      )
    : [];

  return {
    version: raw.version === "email_automation_v1" ? raw.version : "email_automation_v1",
    extractedAt:
      typeof raw.extractedAt === "string" && raw.extractedAt.trim().length > 0
        ? raw.extractedAt
        : new Date(0).toISOString(),
    source: {
      fromEmail: normalizeFieldValue(typeof source?.fromEmail === "string" ? source.fromEmail : null),
      subject: normalizeFieldValue(typeof source?.subject === "string" ? source.subject : null),
      attachmentFileName: normalizeFieldValue(
        typeof source?.attachmentFileName === "string" ? source.attachmentFileName : null
      ),
      attachmentNames: Array.isArray(source?.attachmentNames)
        ? source.attachmentNames.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
          )
        : [],
    },
    fields: {
      clientName: parseField("clientName"),
      dateOfLoss: parseField("dateOfLoss"),
      claimNumber: parseField("claimNumber"),
      insuranceCarrier: parseField("insuranceCarrier"),
    },
    matchSignals: {
      caseNumberCandidates,
      clientNameCandidates,
      supportingSignals,
    },
  };
}

export async function setDocumentEmailAutomation(
  firmId: string,
  documentId: string,
  snapshot: EmailAutomationSnapshot
): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { id: true, metaJson: true },
  });
  if (!doc) return;

  const meta = asRecord(doc.metaJson) ?? {};
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      metaJson: {
        ...meta,
        emailAutomation: snapshot,
      } as Prisma.InputJsonValue,
    },
  });
}
