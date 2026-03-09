/**
 * Citation field extraction for traffic documents.
 * Extracts defendant, citation number, jurisdiction, court, dates, charge.
 * Used when matter type is TRAFFIC. Store raw + normalized; do not invent values.
 */
export interface TrafficCitationExtracted {
  defendantName: string | null;
  citationNumber: string | null;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  courtName: string | null;
  courtType: string | null;
  chargeDescriptionRaw: string | null;
  issueDate: string | null;
  dueDate: string | null;
  hearingDate: string | null;
}

export interface TrafficCitationExtractionResult {
  fields: TrafficCitationExtracted;
  confidence: Record<string, number>;
  sourceSnippets: Record<string, string>;
}

const CITATION_NUMBER = /\b(?:citation\s*(?:no\.?|#|number)?|utc\s*#?)\s*[:\-]?\s*([A-Z0-9\-]+)/i;
const DEFENDANT = /\b(?:defendant|driver|name)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/i;
const DEFENDANT_LINE = /(?:defendant|driver)\s*[:\-]\s*([^\n]{3,80}?)(?=\n|citation|$)/i;
const STATE = /\b(State of |County of )?([A-Z][a-z]+)\s+(?:Stat(?:ute)?\.?|F\.?S\.?|Vehicle Code|V\.?C\.?)/i;
const STATE_ABBR = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
const COUNTY = /\b(?:County of|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[,.]/i;
const COURT_NAME = /\b((?:County|Circuit|Municipal|Superior|District)\s+Court\s+(?:of\s+)?[^,\n]{5,80}?)(?=[,\n]|$)/i;
const COURT_TYPE = /\b(County|Circuit|Municipal|Superior|District)\s+Court/i;
const CHARGE = /\b(?:violation|charge|offense|description)\s*[:\-]\s*([^\n]{5,200}?)(?=\n|$)/i;
const SECTION_CHARGE = /\b(?:section|sec\.?|§)\s*[\d\.\-]+\s*[\(\w\)]*\s*[-–—]\s*([^\n]{5,120}?)(?=\n|$)/i;
const DATE_PATTERN = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g;
const ISSUE_DATE = /\b(?:issue(?:d)?|violation|citation)\s+date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
const DUE_DATE = /\b(?:due|payable by|must (?:pay|appear) by)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
const HEARING_DATE = /\b(?:hearing|court|appear)\s+date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;

function parseDate(s: string | null): string | null {
  if (!s || !s.trim()) return null;
  const t = s.trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(t) || /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(t)) return t;
  return null;
}

export function extractTrafficCitationFields(text: string): TrafficCitationExtractionResult {
  const t = text.replace(/\s+/g, " ").trim();
  const fields: TrafficCitationExtracted = {
    defendantName: null,
    citationNumber: null,
    jurisdictionState: null,
    jurisdictionCounty: null,
    courtName: null,
    courtType: null,
    chargeDescriptionRaw: null,
    issueDate: null,
    dueDate: null,
    hearingDate: null,
  };
  const confidence: Record<string, number> = {};
  const sourceSnippets: Record<string, string> = {};

  const citationMatch = t.match(CITATION_NUMBER);
  if (citationMatch) {
    fields.citationNumber = citationMatch[1].trim();
    confidence.citationNumber = 0.95;
    sourceSnippets.citationNumber = citationMatch[0];
  }

  const defendantMatch = t.match(DEFENDANT) ?? t.match(DEFENDANT_LINE);
  if (defendantMatch) {
    const name = defendantMatch[1].trim().replace(/\s+/g, " ").slice(0, 120);
    if (name.length >= 3) {
      fields.defendantName = name;
      confidence.defendantName = name.split(/\s+/).length >= 2 ? 0.9 : 0.7;
      sourceSnippets.defendantName = defendantMatch[0].slice(0, 80);
    }
  }

  const stateMatch = t.match(STATE) ?? t.match(STATE_ABBR);
  if (stateMatch) {
    const state = stateMatch[2]?.trim() ?? stateMatch[1]?.trim();
    if (state && state.length >= 2 && state.length <= 20) {
      fields.jurisdictionState = state;
      confidence.jurisdictionState = 0.85;
      sourceSnippets.jurisdictionState = stateMatch[0];
    }
  }

  const countyMatch = t.match(COUNTY);
  if (countyMatch) {
    fields.jurisdictionCounty = countyMatch[1].trim().slice(0, 60);
    confidence.jurisdictionCounty = 0.85;
    sourceSnippets.jurisdictionCounty = countyMatch[0];
  }

  const courtNameMatch = t.match(COURT_NAME);
  if (courtNameMatch) {
    fields.courtName = courtNameMatch[1].trim().slice(0, 200);
    confidence.courtName = 0.8;
    sourceSnippets.courtName = courtNameMatch[0];
  }

  const courtTypeMatch = t.match(COURT_TYPE);
  if (courtTypeMatch) {
    fields.courtType = courtTypeMatch[1].trim();
    confidence.courtType = 0.8;
  }

  const chargeMatch = t.match(CHARGE) ?? t.match(SECTION_CHARGE);
  if (chargeMatch) {
    fields.chargeDescriptionRaw = chargeMatch[1].trim().replace(/\s+/g, " ").slice(0, 500);
    confidence.chargeDescriptionRaw = 0.75;
    sourceSnippets.chargeDescriptionRaw = chargeMatch[0].slice(0, 120);
  }

  const issueMatch = t.match(ISSUE_DATE);
  if (issueMatch) {
    fields.issueDate = parseDate(issueMatch[1]);
    if (fields.issueDate) confidence.issueDate = 0.9;
  }

  const dueMatch = t.match(DUE_DATE);
  if (dueMatch) {
    fields.dueDate = parseDate(dueMatch[1]);
    if (fields.dueDate) confidence.dueDate = 0.9;
  }

  const hearingMatch = t.match(HEARING_DATE);
  if (hearingMatch) {
    fields.hearingDate = parseDate(hearingMatch[1]);
    if (fields.hearingDate) confidence.hearingDate = 0.9;
  }

  return { fields, confidence, sourceSnippets };
}
