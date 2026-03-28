/**
 * Format an ISO date string for display (e.g. "Mar 6, 2026 – 3:22 PM").
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} – ${timeStr}`;
  } catch {
    return iso;
  }
}

/**
 * Format an ISO date string for date-only display (e.g. "Mar 6, 2026").
 */
export function formatDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
