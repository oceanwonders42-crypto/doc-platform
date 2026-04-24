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
  processingStage?: string | null;
  routedCaseId?: string | null;
  processedAt?: string | Date | null;
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

function hasDocumentProcessedAt(value: string | Date | null | undefined): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  return typeof value === "string" && value.trim().length > 0;
}

export function getNormalizedDocumentStatus(
  doc: ReviewableDocument
): string | null {
  const storedStatus = typeof doc.status === "string" ? doc.status : null;
  if (storedStatus !== "PROCESSING") return storedStatus;

  const storedReviewState = getStoredDocumentReviewState(doc.reviewState);
  if (storedReviewState === "APPROVED" || storedReviewState === "EXPORT_READY") {
    return "UPLOADED";
  }
  if (storedReviewState === "IN_REVIEW" || storedReviewState === "REJECTED") {
    return "NEEDS_REVIEW";
  }

  if (
    doc.routedCaseId &&
    (doc.processingStage === "complete" || hasDocumentProcessedAt(doc.processedAt))
  ) {
    return "UPLOADED";
  }

  return storedStatus;
}

export function canMarkDocumentExportReady(reviewState: unknown): boolean {
  return getStoredDocumentReviewState(reviewState) === "APPROVED";
}
