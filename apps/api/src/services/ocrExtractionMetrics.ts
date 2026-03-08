/**
 * OCR and extraction quality metrics for admin/quality dashboard.
 * Counts: low-confidence fields, handwriting docs, multilingual docs, pages flagged for review.
 */
import { pgPool } from "../db/pg";

export type OcrExtractionMetrics = {
  totalProcessed: number;
  withLowOcrConfidence: number;
  withHandwriting: number;
  withHandwritingHeavy: number;
  multilingual: number;
  pagesFlaggedReview: number;
  extractionStrictModeUsed: number;
  withConsistencyConflicts: number;
};

/**
 * Aggregate metrics from document_recognition (and optionally Document.extractedFields)
 * for the given firm or all firms (when firmId is null).
 */
export async function getOcrExtractionMetrics(
  firmId: string | null
): Promise<OcrExtractionMetrics> {
  const firmFilter = firmId ? `AND d."firmId" = $1` : "";
  const params = firmId ? [firmId] : [];

  const baseFrom = `FROM document_recognition dr INNER JOIN "Document" d ON d.id = dr.document_id WHERE 1=1 ${firmFilter}`;

  const [total, lowConf, hw, hwHeavy, multiLang, pagesReview, strictUsed, conflicts] = await Promise.all([
    pgPool.query<{ count: string }>(`SELECT COUNT(*)::text AS count ${baseFrom}`, params),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom} AND (dr.ocr_confidence IS NOT NULL AND dr.ocr_confidence < 0.7)`,
      params
    ),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom} AND dr.has_handwriting = true`,
      params
    ),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom} AND dr.handwriting_heavy = true`,
      params
    ),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom} AND dr.detected_language IS NOT NULL AND dr.detected_language != 'en'`,
      params
    ),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom} AND dr.page_diagnostics IS NOT NULL AND dr.page_diagnostics::text LIKE '%NEEDS_REVIEW%'`,
      params
    ),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom} AND dr.extraction_strict_mode = true`,
      params
    ),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom} AND d."extractedFields" IS NOT NULL AND (d."extractedFields"->>'consistencyConflicts') IS NOT NULL`,
      params
    ),
  ]);

  const num = (r: { rows: { count?: string }[] }) => parseInt(r.rows[0]?.count ?? "0", 10) || 0;

  return {
    totalProcessed: num(total),
    withLowOcrConfidence: num(lowConf),
    withHandwriting: num(hw),
    withHandwritingHeavy: num(hwHeavy),
    multilingual: num(multiLang),
    pagesFlaggedReview: num(pagesReview),
    extractionStrictModeUsed: num(strictUsed),
    withConsistencyConflicts: num(conflicts),
  };
}
