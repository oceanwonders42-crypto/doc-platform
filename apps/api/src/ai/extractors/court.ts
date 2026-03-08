/**
 * Extract court-related fields from document text.
 * Used when docType starts with "court_".
 */
export interface CourtExtracted {
  caseNumber?: string | null;
  courtName?: string | null;
  county?: string | null;
  parties?: { plaintiff?: string; defendant?: string } | null;
  judge?: string | null;
  filingDate?: string | null;
  hearingDate?: string | null;
  deadlines?: string[] | null;
}

const CASE_NO = /\b(?:case\s*(?:no\.?|#|number)\s*[:\-]?\s*)([A-Z0-9\-\.\/]{4,})/i;
const COURT_NAME = /\b(?:in\s+the\s+)?(?:superior|district|circuit|county|municipal)\s+court\s+(?:of\s+)?([^,\n]+)/i;
const COUNTY = /\b(\w+(?:\s+\w+)?)\s+county\s+(?:superior|district|circuit)?\s+court/i;
const PLAINTIFF = /\bplaintiffs?[:\s]+([A-Za-z][^.\n]{2,80}?)(?=\s+vs?\.|\s+v\.\s+|defendant|$)/is;
const DEFENDANT = /\bdefendants?[:\s]+([A-Za-z][^.\n]{2,80}?)(?=\s*\.|$)/is;
const JUDGE = /\b(?:honorable|judge)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
const FILING_DATE = /\b(?:filed?|filing)\s+date\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
const HEARING_DATE = /\b(?:hearing|date)\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
const DEADLINE = /\b(?:deadline|due\s+date|must\s+file|by)\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/gi;

export function extractCourt(text: string): CourtExtracted {
  const out: CourtExtracted = {};
  const t = text.replace(/\s+/g, " ").trim();

  const caseMatch = t.match(CASE_NO);
  if (caseMatch) out.caseNumber = caseMatch[1].trim();

  const courtMatch = t.match(COURT_NAME);
  if (courtMatch) out.courtName = courtMatch[1].trim();

  const countyMatch = t.match(COUNTY);
  if (countyMatch) out.county = countyMatch[1].trim();

  const plaintiffMatch = t.match(PLAINTIFF);
  const defendantMatch = t.match(DEFENDANT);
  if (plaintiffMatch || defendantMatch) {
    out.parties = {};
    if (plaintiffMatch) out.parties.plaintiff = plaintiffMatch[1].trim().slice(0, 200);
    if (defendantMatch) out.parties.defendant = defendantMatch[1].trim().slice(0, 200);
  }

  const judgeMatch = t.match(JUDGE);
  if (judgeMatch) out.judge = judgeMatch[1].trim();

  const filingMatch = t.match(FILING_DATE);
  if (filingMatch) out.filingDate = filingMatch[1].trim();

  const hearingMatch = t.match(HEARING_DATE);
  if (hearingMatch) out.hearingDate = hearingMatch[1].trim();

  const deadlines: string[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = DEADLINE.exec(t)) !== null) {
    const d = dm[1].trim();
    if (d && !deadlines.includes(d)) deadlines.push(d);
  }
  if (deadlines.length) out.deadlines = deadlines;

  return out;
}
