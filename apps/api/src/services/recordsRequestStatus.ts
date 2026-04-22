export const RECORDS_REQUEST_STATUSES = [
  "DRAFT",
  "SENT",
  "FOLLOW_UP_DUE",
  "RECEIVED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type RecordsRequestStatus = (typeof RECORDS_REQUEST_STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, RecordsRequestStatus> = {
  draft: "DRAFT",
  drafted: "DRAFT",
  sent: "SENT",
  follow_up_due: "FOLLOW_UP_DUE",
  "follow-up-due": "FOLLOW_UP_DUE",
  "follow up due": "FOLLOW_UP_DUE",
  received: "RECEIVED",
  completed: "COMPLETED",
  failed: "FAILED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
};

export function normalizeRecordsRequestStatus(
  status: unknown,
  fallback: RecordsRequestStatus = "DRAFT"
): RecordsRequestStatus {
  if (typeof status !== "string") return fallback;
  const trimmed = status.trim();
  if (!trimmed) return fallback;

  const upper = trimmed.toUpperCase();
  if ((RECORDS_REQUEST_STATUSES as readonly string[]).includes(upper)) {
    return upper as RecordsRequestStatus;
  }

  const normalizedKey = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  return LEGACY_STATUS_MAP[normalizedKey] ?? fallback;
}

export function recordsRequestStatusLabel(status: unknown): string {
  switch (normalizeRecordsRequestStatus(status)) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "FOLLOW_UP_DUE":
      return "Follow-up Due";
    case "RECEIVED":
      return "Received";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
  }
}

export function isSendableRecordsRequestStatus(status: unknown): boolean {
  const normalized = normalizeRecordsRequestStatus(status);
  return normalized === "DRAFT" || normalized === "FAILED" || normalized === "FOLLOW_UP_DUE";
}
