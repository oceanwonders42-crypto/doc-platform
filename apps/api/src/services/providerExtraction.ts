/**
 * Queue 2: Provider detection and normalization from document text.
 * Extracts provider name, facility, specialty, phone, fax, address.
 * Normalizes names and matches existing providers; creates suggestions when unmatched.
 * Core provider detection: extractProviderCandidateFromText returns a candidate with confidence
 * so weak guesses are flagged rather than forced into provider_name.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { randomUUID } from "crypto";

export type ProviderCandidateConfidence = "high" | "medium" | "low";

export interface ProviderCandidate {
  name: string | null;
  facility: string | null;
  confidence: ProviderCandidateConfidence;
  source: "records" | "bills" | "generic";
}

export interface ExtractedProvider {
  providerName: string | null;
  facilityName: string | null;
  specialty: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
}

const PHONE_REGEX = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
const FAX_LABEL = /\bfax\s*[:\-#]?\s*(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/gi;
const PHONE_LABEL = /\b(phone|tel|telephone)\s*[:\-#]?\s*(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/gi;

const FACILITY_PREFIXES = [
  "hospital",
  "medical center",
  "clinic",
  "health system",
  "emergency department",
  "imaging center",
  "surgery center",
  "urgent care",
  "rehab",
  "physical therapy",
  "radiology",
];

const SPECIALTY_HINTS = [
  "primary care",
  "internal medicine",
  "family medicine",
  "orthopedic",
  "neurology",
  "radiology",
  "emergency medicine",
  "surgery",
  "physical therapy",
  "occupational therapy",
];

function normalizeWhitespace(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/\s+/g, " ").trim();
}

function normalizeProviderName(name: string | null | undefined): string {
  const s = normalizeWhitespace(name);
  if (!s) return "";
  return s
    .replace(/,?\s*(md|do|np|pa|rn|pt|ot)\s*\.?$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract first phone-like number from text. */
function extractFirstPhone(text: string): string | null {
  const m = text.match(/(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
  return m ? m[0].replace(/\s/g, "").replace(/^\+?1/, "").slice(0, 14) : null;
}

/** Prefer number after "fax" label. */
function extractFax(text: string): string | null {
  const m = text.match(FAX_LABEL);
  if (m) return extractFirstPhone(m[0]);
  return null;
}

/** Prefer number after "phone" / "tel" label, else first number. */
function extractPhone(text: string): string | null {
  const m = text.match(PHONE_LABEL);
  if (m) return extractFirstPhone(m[0]);
  return extractFirstPhone(text);
}

/** Simple address line: "number + street" or "street" pattern. */
function extractAddress(text: string): string | null {
  const addrMatch = text.match(
    /\b(\d{1,6}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|blvd|drive|dr|lane|ln|way|place|pl)\b[^.]{0,80})/i
  );
  if (addrMatch) return normalizeWhitespace(addrMatch[1]).slice(0, 200);
  const cityState = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s+\d{5}(-\d{4})?\b/);
  if (cityState) return normalizeWhitespace(cityState[0]).slice(0, 200);
  return null;
}

/** Infer facility name: line containing facility-like prefix. */
function extractFacility(text: string): string | null {
  const lines = text.split(/\n/);
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const p of FACILITY_PREFIXES) {
      if (lower.includes(p)) {
        const cleaned = normalizeWhitespace(line).slice(0, 150);
        if (cleaned.length >= 5) return cleaned;
      }
    }
  }
  return null;
}

/** Infer specialty from text. */
function extractSpecialty(text: string): string | null {
  const lower = text.toLowerCase();
  for (const s of SPECIALTY_HINTS) {
    if (lower.includes(s)) return s.replace(/\s+/g, "_");
  }
  return null;
}

/** Extract provider/organization name: often "Name, MD" or "Name Medical Group" or first substantial line. */
function extractProviderName(text: string): string | null {
  const mdMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\s*,?\s*(?:MD|DO|NP|PA)\.?/);
  if (mdMatch) return normalizeProviderName(mdMatch[1]);
  const groupMatch = text.match(/\b((?:[A-Za-z][A-Za-z\s&]{4,60})\s*(?:medical group|clinic|associates|hospital|center))\b/i);
  if (groupMatch) return normalizeProviderName(groupMatch[1]);
  const firstLines = text.split(/\n/).map((l) => normalizeWhitespace(l)).filter((l) => l.length >= 6 && l.length <= 80);
  if (firstLines.length > 0) return normalizeProviderName(firstLines[0]);
  return null;
}

/** Provider/Physician/Attending label patterns for high-confidence extraction. */
const PROVIDER_LABEL = /\b(?:provider|physician|doctor|attending|md|do)\s*[:\-#]?\s*([A-Z][a-zA-Z\s\.\-]{2,80}?)(?=\n|$|date|diagnosis|facility|patient)/i;

/**
 * Extract a single provider candidate with confidence and source.
 * Used by classification and extraction to avoid forcing weak guesses into provider_name.
 */
export function extractProviderCandidateFromText(
  text: string,
  docType: string | null | undefined
): ProviderCandidate {
  const t = text.slice(0, 15000);
  const source: ProviderCandidate["source"] =
    docType === "medical_record" || docType === "medical" || docType === "police_report"
      ? "records"
      : docType === "medical_bill" || docType === "billing_statement" || docType === "ledger_statement"
        ? "bills"
        : "generic";

  const labelMatch = t.match(PROVIDER_LABEL);
  const nameFromLabel = labelMatch ? normalizeProviderName(labelMatch[1]) : null;

  const nameFromMd = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\s*,?\s*(?:MD|DO|NP|PA)\.?/);
  const nameFromMdNorm = nameFromMd ? normalizeProviderName(nameFromMd[1]) : null;

  const facility = extractFacility(t);
  const groupMatch = t.match(/\b((?:[A-Za-z][A-Za-z\s&]{4,60})\s*(?:medical group|clinic|associates|hospital|center))\b/i);
  const nameFromGroup = groupMatch ? normalizeProviderName(groupMatch[1]) : null;

  const firstLines = t.split(/\n/).map((l) => normalizeWhitespace(l)).filter((l) => l.length >= 6 && l.length <= 80);
  const nameFromFirstLine = firstLines.length > 0 ? normalizeProviderName(firstLines[0]) : null;

  let name: string | null = null;
  let confidence: ProviderCandidateConfidence = "low";

  if (nameFromLabel && nameFromLabel.length >= 2) {
    name = nameFromLabel;
    confidence = "high";
  } else if (nameFromMdNorm && nameFromMdNorm.length >= 2) {
    name = nameFromMdNorm;
    confidence = "high";
  } else if (nameFromGroup && nameFromGroup.length >= 2) {
    name = nameFromGroup;
    confidence = "medium";
  } else if (facility && facility.length >= 2) {
    name = facility;
    confidence = "medium";
  } else if (nameFromFirstLine && nameFromFirstLine.length >= 2) {
    name = nameFromFirstLine;
    confidence = "low";
  }

  if (!name && facility) {
    name = facility;
    confidence = confidence === "low" ? "medium" : confidence;
  }

  return {
    name: name || null,
    facility: facility || null,
    confidence,
    source,
  };
}

/** Confidence levels that are safe to set as document_recognition.provider_name. Low is stored only in metadata. */
export const PROVIDER_CONFIDENCE_FOR_NAME: ProviderCandidateConfidence[] = ["high", "medium"];

export function isProviderCandidateConfident(c: ProviderCandidate): boolean {
  return PROVIDER_CONFIDENCE_FOR_NAME.includes(c.confidence);
}

export function extractProviderFromText(text: string): ExtractedProvider {
  const t = text.slice(0, 15000);
  return {
    providerName: extractProviderName(t),
    facilityName: extractFacility(t),
    specialty: extractSpecialty(t),
    phone: extractPhone(t),
    fax: extractFax(t),
    address: extractAddress(t),
  };
}

export function normalizeProviderNameForMatch(name: string): string {
  return normalizeProviderName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Find a matching Provider for the firm by normalized name (and optional facility). */
export async function matchProvider(
  firmId: string,
  extracted: ExtractedProvider
): Promise<{ providerId: string; name: string } | null> {
  const name = extracted.providerName || extracted.facilityName;
  if (!name || name.length < 2) return null;

  const norm = normalizeProviderNameForMatch(name);
  if (norm.length < 2) return null;

  const providers = await prisma.provider.findMany({
    where: { firmId, listingActive: true },
    select: { id: true, name: true },
  });

  for (const p of providers) {
    const pNorm = normalizeProviderNameForMatch(p.name);
    if (pNorm === norm || pNorm.includes(norm) || norm.includes(pNorm)) {
      return { providerId: p.id, name: p.name };
    }
  }
  return null;
}

/** Insert provider suggestion for unmatched extracted provider; link to document. */
export async function createProviderSuggestion(
  firmId: string,
  documentId: string,
  extracted: ExtractedProvider
): Promise<void> {
  const name = extracted.providerName || extracted.facilityName;
  if (!name) return;

  await pgPool.query(
    `INSERT INTO document_provider_suggestion (id, firm_id, document_id, extracted_name, facility_name, specialty, phone, fax, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      randomUUID(),
      firmId,
      documentId,
      name,
      extracted.facilityName,
      extracted.specialty,
      extracted.phone,
      extracted.fax,
      extracted.address,
    ]
  );
}
