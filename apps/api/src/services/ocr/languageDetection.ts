/**
 * Language detection for OCR/extraction.
 * Heuristic: detect likely document language(s) from extracted text.
 * For production, consider a dedicated library (e.g. franc, cld) or API.
 */
export interface LanguageDetectionResult {
  detectedLanguage: string;
  possibleLanguages: string[];
  confidence: number;
}

const ENGLISH_COMMON = /\b(the|and|for|with|patient|medical|record|date|service|insurance|claim|diagnosis|treatment|doctor|hospital)\b/gi;
const SPANISH_COMMON = /\b(el|la|de|que|en|los|del|las|paciente|fecha|servicio|diagnóstico|tratamiento|médico|hospital)\b/gi;
const FRENCH_COMMON = /\b(le|la|de|et|les|des|patient|date|service|diagnostic|traitement|médecin|hôpital)\b/gi;

export function detectLanguageFromText(text: string): LanguageDetectionResult {
  const t = (text || "").trim().slice(0, 10000).toLowerCase();
  if (t.length < 20) {
    return { detectedLanguage: "en", possibleLanguages: ["en"], confidence: 0.3 };
  }

  const enCount = (t.match(ENGLISH_COMMON) || []).length;
  const esCount = (t.match(SPANISH_COMMON) || []).length;
  const frCount = (t.match(FRENCH_COMMON) || []).length;

  const candidates: { lang: string; count: number }[] = [
    { lang: "en", count: enCount },
    { lang: "es", count: esCount },
    { lang: "fr", count: frCount },
  ];
  candidates.sort((a, b) => b.count - a.count);
  const top = candidates[0];
  const possibleLanguages = candidates.filter((c) => c.count > 0).map((c) => c.lang);
  if (possibleLanguages.length === 0) possibleLanguages.push("en");

  const total = enCount + esCount + frCount || 1;
  const confidence = Math.min(0.95, 0.4 + (top.count / total) * 0.5);

  return {
    detectedLanguage: top.count > 0 ? top.lang : "en",
    possibleLanguages: possibleLanguages.length ? possibleLanguages : ["en"],
    confidence,
  };
}

/** Alias for callers expecting detectLanguage(text). */
export function detectLanguage(text: string): LanguageDetectionResult {
  return detectLanguageFromText(text);
}

/** Heuristic: true when text contains a substantial proportion of non-Latin script. */
export function hasNonLatinScript(text: string): boolean {
  const t = (text || "").trim().slice(0, 5000);
  if (t.length < 50) return false;
  const nonLatin = t.replace(/[\x00-\x7F]/g, "").length;
  return nonLatin / t.length > 0.15;
}
