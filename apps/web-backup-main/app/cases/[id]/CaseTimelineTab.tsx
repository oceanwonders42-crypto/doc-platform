"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { formatDate } from "../../lib/formatTimestamp";
import RebuildTimelineBlock from "./timeline/RebuildTimelineBlock";

type TimelineEvent = {
  id: string;
  eventDate: string | null;
  eventType: string | null;
  track: string;
  facilityId: string | null;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | null;
  documentId: string;
  metadataJson: unknown;
  createdAt: string;
};

function buildHubTimelineUrl(
  caseId: string,
  params: { track?: string; dateFrom?: string; dateTo?: string; provider?: string }
): string {
  const q = new URLSearchParams({ tab: "timeline" });
  if (params.track && params.track !== "all") q.set("track", params.track);
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.provider?.trim()) q.set("provider", params.provider.trim());
  return `/cases/${caseId}?${q.toString()}`;
}

export default function CaseTimelineTab({
  caseId,
  features,
  timelineMeta,
}: {
  caseId: string;
  features: { insurance_extraction: boolean; court_extraction: boolean };
  timelineMeta: { lastRebuiltAt: string | null };
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const track = searchParams.get("track") || "all";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const provider = searchParams.get("provider") || "";

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const effectiveTrack = track === "all" ? null : track;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const qs = new URLSearchParams();
      if (effectiveTrack) qs.set("track", effectiveTrack);
      if (dateFrom) qs.set("dateFrom", dateFrom);
      if (dateTo) qs.set("dateTo", dateTo);
      if (provider.trim()) qs.set("provider", provider.trim());
      const q = qs.toString() ? `?${qs}` : "";
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/timeline${q}`);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: TimelineEvent[] };
      setEvents(Array.isArray(data.items) ? data.items : []);
      setLoading(false);
    }
    load();
  }, [caseId, effectiveTrack, dateFrom, dateTo, provider]);

  const trackTabs = [
    { value: "all", label: "All" },
    { value: "medical", label: "Medical" },
    ...(features.court_extraction ? [{ value: "legal", label: "Legal" }] : []),
    ...(features.insurance_extraction ? [{ value: "insurance", label: "Insurance" }] : []),
  ];

  return (
    <section>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {trackTabs.map((t) => (
          <Link
            key={t.value}
            href={buildHubTimelineUrl(caseId, { track: t.value, dateFrom, dateTo, provider })}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 8,
              textDecoration: "none",
              background: track === t.value ? "#111" : "#f0f0f0",
              color: track === t.value ? "#fff" : "#333",
              border: `1px solid ${track === t.value ? "#111" : "#ddd"}`,
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <RebuildTimelineBlock caseId={caseId} lastRebuiltAt={timelineMeta.lastRebuiltAt} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const t = (fd.get("track") as string) || "all";
          const df = (fd.get("dateFrom") as string)?.trim() || "";
          const dt = (fd.get("dateTo") as string)?.trim() || "";
          const p = (fd.get("provider") as string)?.trim() || "";
          router.push(buildHubTimelineUrl(caseId, { track: t, dateFrom: df, dateTo: dt, provider: p }));
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 20,
          padding: "12px 16px",
          background: "#f9f9f9",
          borderRadius: 8,
          border: "1px solid #eee",
        }}
      >
        <input type="hidden" name="track" value={track} />
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555" }}>
          From
          <input type="date" name="dateFrom" defaultValue={dateFrom} style={{ padding: "6px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555" }}>
          To
          <input type="date" name="dateTo" defaultValue={dateTo} style={{ padding: "6px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555" }}>
          Provider
          <input type="text" name="provider" placeholder="Filter by provider" defaultValue={provider} style={{ padding: "6px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6, minWidth: 160 }} />
        </label>
        <button type="submit" style={{ padding: "6px 14px", fontSize: 14, border: "1px solid #333", borderRadius: 6, background: "#111", color: "#fff", cursor: "pointer" }}>
          Apply filters
        </button>
        {(dateFrom || dateTo || provider) && (
          <Link href={buildHubTimelineUrl(caseId, { track: track !== "all" ? track : undefined })} style={{ fontSize: 13, color: "#666", textDecoration: "underline" }}>
            Clear filters
          </Link>
        )}
      </form>

      {loading ? (
        <p style={{ color: "#666", fontSize: 14 }}>Loading timeline…</p>
      ) : events.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>No timeline events in this track.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {events.map((ev) => (
            <li key={ev.id} style={{ padding: "12px 0", borderBottom: "1px solid #eee", fontSize: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: ev.track === "legal" ? "#e8eaf6" : ev.track === "insurance" ? "#e3f2fd" : "#f5f5f5",
                    color: "#333",
                  }}
                >
                  {ev.track}
                </span>
                {ev.eventDate && <span style={{ color: "#666" }}>{formatDate(ev.eventDate)}</span>}
                <strong>{ev.eventType ?? "Event"}</strong>
                {ev.amount && <span style={{ color: "#066" }}>${ev.amount}</span>}
              </div>
              {(ev.provider || ev.diagnosis || ev.procedure) && (
                <div style={{ marginTop: 4, color: "#555", fontSize: 13 }}>
                  {[ev.provider, ev.diagnosis, ev.procedure].filter(Boolean).join(" · ")}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <Link href={`/documents/${ev.documentId}`} style={{ fontSize: 12, color: "#06c", textDecoration: "underline" }}>
                  View document
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
