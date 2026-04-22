/**
 * Handwriting detection heuristic.
 * Real implementation would use a vision/OCR model. Here we use text-based heuristics:
 * - Very short or fragmented text with high word-count variance can indicate handwriting OCR.
 * - We do not have image-level handwriting detection without an external service.
 */
export interface HandwritingDetectionResult {
  hasHandwriting: boolean;
  handwritingHeavy: boolean;
  confidence: number;
}

export function detectHandwritingFromText(
  text: string,
  _pageImages?: Buffer[]
): HandwritingDetectionResult {
  const t = (text || "").trim();
  if (t.length < 30) {
    return { hasHandwriting: false, handwritingHeavy: false, confidence: 0.5 };
  }

  const lines = t.split(/\n/).filter((l) => l.trim().length > 0);
  const wordLengths = t.split(/\s+/).map((w) => w.length);
  const avgLen = wordLengths.reduce((a, b) => a + b, 0) / (wordLengths.length || 1);
  const variance =
    wordLengths.reduce((s, n) => s + (n - avgLen) ** 2, 0) / (wordLengths.length || 1);

  const fragmented = lines.length > 5 && avgLen < 4 && variance > 2;
  const veryShortLines = lines.filter((l) => l.trim().length < 15).length / (lines.length || 1) > 0.6;

  const likelyHandwriting = fragmented || veryShortLines;
  return {
    hasHandwriting: likelyHandwriting,
    handwritingHeavy: likelyHandwriting && lines.length > 3,
    confidence: likelyHandwriting ? 0.6 : 0.7,
  };
}
