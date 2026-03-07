/**
 * Apply strict mode to flat extracted fields.
 * When strictMode is true and document confidence is below threshold, null out key fields
 * so we do not autofill as final truth; they remain available as candidates for review.
 */
export function applyStrictModeToFlatFields(
  extracted: Record<string, unknown>,
  documentConfidence: number,
  strictMode: boolean,
  confidenceThreshold: number
): Record<string, unknown> {
  const out = { ...extracted };
  if (!strictMode) return out;

  const keyFields = ["caseNumber", "clientName", "incidentDate", "client_name", "case_number", "incident_date"];
  if (documentConfidence < confidenceThreshold) {
    for (const k of keyFields) {
      if (k in out && out[k] != null) {
        out[`${k}_raw`] = out[k];
        out[k] = null;
        out[`${k}_uncertain`] = true;
      }
    }
  }
  return out;
}
