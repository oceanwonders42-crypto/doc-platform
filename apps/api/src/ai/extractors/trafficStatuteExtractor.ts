/**
 * Extract and normalize cited statute/code section from traffic documents.
 * Keeps raw value; normalizes to jurisdiction-aware format when possible.
 */
export interface StatuteExtractionResult {
  statuteCodeRaw: string | null;
  statuteCodeNormalized: string | null;
  subsection: string | null;
  chargeContext: string | null;
  confidence: number;
  reviewRecommended: boolean;
}

const PATTERNS = [
  /\b(?:Fla\.?|Florida)\s+Stat(?:ute)?\.?\s*§?\s*(\d+(?:\.\d+)*)\s*(?:\((\w+)\))?/i,
  /\b(?:section|sec\.?|§)\s*(\d+(?:\.\d+)*)\s*(?:\((\w+)\))?/gi,
  /\b(?:ordinance|ord\.?)\s*(\d+[\-\w\.]*)\s*(?:\((\w+)\))?/i,
  /\b(?:municipal|city)\s+code\s*[:\-]?\s*([\d\-\.]+(?:\s*[\(\w\)]+)?)/i,
  /\b(\d{2,3}\.\d{2,4}(?:\(\d+\))?)\b/, // e.g. 316.1925(1)
];

export function extractTrafficStatuteCode(text: string): StatuteExtractionResult {
  const result: StatuteExtractionResult = {
    statuteCodeRaw: null,
    statuteCodeNormalized: null,
    subsection: null,
    chargeContext: null,
    confidence: 0,
    reviewRecommended: true,
  };

  const t = text.replace(/\s+/g, " ").trim();

  for (const re of PATTERNS) {
    const m = t.match(re);
    if (!m) continue;

    const main = m[1]?.trim();
    const sub = m[2]?.trim() ?? null;
    if (!main || main.length < 2) continue;

    const raw = sub ? `${main}(${sub})` : main;
    result.statuteCodeRaw = raw;
    result.subsection = sub;

    if (/^Fla\.?|Florida/i.test(m[0] ?? "")) {
      result.statuteCodeNormalized = `Fla. Stat. § ${main}${sub ? `(${sub})` : ""}`;
      result.confidence = 0.9;
      result.reviewRecommended = false;
    } else if (/^\d+\.\d+/.test(main)) {
      result.statuteCodeNormalized = main + (sub ? `(${sub})` : "");
      result.confidence = 0.75;
      result.reviewRecommended = result.confidence < 0.8;
    } else {
      result.statuteCodeNormalized = raw;
      result.confidence = 0.6;
      result.reviewRecommended = true;
    }

    const after = t.indexOf(m[0] ?? "") + (m[0]?.length ?? 0);
    const context = t.slice(after, after + 120).trim();
    if (context) result.chargeContext = context.slice(0, 100);
    break;
  }

  return result;
}

const STATE_PREFIX: Record<string, string> = {
  FL: "Fla. Stat. §",
  FLORIDA: "Fla. Stat. §",
  CA: "Cal. Veh. Code §",
  CALIFORNIA: "Cal. Veh. Code §",
  TX: "Tex. Transp. Code §",
  TEXAS: "Tex. Transp. Code §",
};

/**
 * Normalize a raw statute string to a jurisdiction-aware format.
 * Best-effort; returns original if no mapping.
 */
export function normalizeTrafficStatuteCode(
  raw: string | null,
  jurisdictionState: string | null
): string | null {
  if (!raw || !raw.trim()) return null;
  const r = raw.trim();
  if (!jurisdictionState) return r;

  const stateKey = jurisdictionState.toUpperCase().replace(/\s+/g, "_").slice(0, 20);
  const prefix = STATE_PREFIX[jurisdictionState.toUpperCase()] ?? STATE_PREFIX[stateKey] ?? null;

  if (prefix) {
    const num = r.replace(/^[^\d]+/, "").replace(/\s+/g, "").trim();
    if (num) return `${prefix} ${num}`;
  }
  return r;
}
