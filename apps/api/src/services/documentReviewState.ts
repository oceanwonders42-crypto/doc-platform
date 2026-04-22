export const DOCUMENT_REVIEW_STATES = [
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXPORT_READY",
] as const;

export type DocumentReviewStateValue = (typeof DOCUMENT_REVIEW_STATES)[number];

type ReviewableDocument = {
  reviewState?: string | null;
  status?: string | null;
};

export function isDocumentReviewState(value: unknown): value is DocumentReviewStateValue {
  return (
    typeof value === "string" &&
    DOCUMENT_REVIEW_STATES.includes(value as DocumentReviewStateValue)
  );
}

export function getStoredDocumentReviewState(value: unknown): DocumentReviewStateValue | null {
  return isDocumentReviewState(value) ? value : null;
}

export function getEffectiveDocumentReviewState(
  doc: ReviewableDocument
): DocumentReviewStateValue | null {
  if (isDocumentReviewState(doc.reviewState)) {
    return doc.reviewState;
  }
  if (doc.status === "NEEDS_REVIEW") {
    return "IN_REVIEW";
  }
  return null;
}

export function canMarkDocumentExportReady(reviewState: unknown): boolean {
  return getStoredDocumentReviewState(reviewState) === "APPROVED";
}
