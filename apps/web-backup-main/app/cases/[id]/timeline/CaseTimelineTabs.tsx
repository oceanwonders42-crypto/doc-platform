"use client";

import Link from "next/link";

type Tab = "all" | "medical" | "legal" | "insurance";

const ALL_TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "medical", label: "Medical" },
  { value: "legal", label: "Legal" },
  { value: "insurance", label: "Insurance" },
];

function buildTimelineUrl(
  caseId: string,
  track: Tab,
  extra?: { dateFrom?: string; dateTo?: string; provider?: string }
): string {
  const params = new URLSearchParams();
  if (track !== "all") params.set("track", track);
  if (extra?.dateFrom) params.set("dateFrom", extra.dateFrom);
  if (extra?.dateTo) params.set("dateTo", extra.dateTo);
  if (extra?.provider?.trim()) params.set("provider", extra.provider.trim());
  const q = params.toString();
  return q ? `/cases/${caseId}/timeline?${q}` : `/cases/${caseId}/timeline`;
}

export default function CaseTimelineTabs({
  caseId,
  currentTrack,
  features = { insurance_extraction: false, court_extraction: false },
  dateFrom,
  dateTo,
  provider,
}: {
  caseId: string;
  currentTrack: string;
  features?: { insurance_extraction: boolean; court_extraction: boolean };
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
}) {
  const extra = { dateFrom, dateTo, provider };
  const tabs = ALL_TABS.filter(
    (tab) =>
      tab.value === "all" ||
      tab.value === "medical" ||
      (tab.value === "legal" && features.court_extraction) ||
      (tab.value === "insurance" && features.insurance_extraction)
  );

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {tabs.map((tab) => {
        const isActive = currentTrack === tab.value;
        return (
          <Link
            key={tab.value}
            href={buildTimelineUrl(caseId, tab.value, extra)}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 8,
              textDecoration: "none",
              background: isActive ? "#111" : "#f0f0f0",
              color: isActive ? "#fff" : "#333",
              border: `1px solid ${isActive ? "#111" : "#ddd"}`,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
