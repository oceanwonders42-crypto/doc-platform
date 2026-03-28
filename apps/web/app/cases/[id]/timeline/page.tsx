import Link from "next/link";
import { notFound } from "next/navigation";
import CaseTimelineTabs from "./CaseTimelineTabs";
import RebuildTimelineBlock from "./RebuildTimelineBlock";
import TimelineFilters from "./TimelineFilters";

async function fetchTimelineMeta(caseId: string): Promise<{ lastRebuiltAt: string | null }> {
  const base = process.env.DOC_WEB_BASE_URL ?? "";
  const res = await fetch(`${base}/api/cases/${caseId}/timeline-meta`, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return { lastRebuiltAt: null };
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; lastRebuiltAt?: string | null };
  return { lastRebuiltAt: data.lastRebuiltAt ?? null };
}

type TimelineFilters = {
  track?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  provider?: string | null;
};

async function fetchTimeline(caseId: string, filters: TimelineFilters): Promise<{
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
}[]> {
  const base = process.env.DOC_WEB_BASE_URL ?? "";
  const qs = new URLSearchParams();
  if (filters.track && ["medical", "legal", "insurance"].includes(filters.track)) qs.set("track", filters.track);
  if (filters.dateFrom) qs.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) qs.set("dateTo", filters.dateTo);
  if (filters.provider?.trim()) qs.set("provider", filters.provider.trim());
  const q = qs.toString() ? `?${qs}` : "";
  const res = await fetch(`${base}/api/cases/${caseId}/timeline${q}`, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: unknown[] };
  return Array.isArray(data.items) ? (data.items as any[]) : [];
}

async function fetchFeatures(): Promise<{ insurance_extraction: boolean; court_extraction: boolean }> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return { insurance_extraction: false, court_extraction: false };
  const res = await fetch(`${base}/me/features`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { insurance_extraction: false, court_extraction: false };
  const data = (await res.json().catch(() => ({}))) as { insurance_extraction?: boolean; court_extraction?: boolean };
  return {
    insurance_extraction: Boolean(data.insurance_extraction),
    court_extraction: Boolean(data.court_extraction),
  };
}

export default async function CaseTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ track?: string; dateFrom?: string; dateTo?: string; provider?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!id) notFound();

  const track = sp.track && ["medical", "legal", "insurance", "all"].includes(sp.track) ? sp.track : "all";
  const effectiveTrack = track === "all" ? null : track;
  const [events, features, timelineMeta] = await Promise.all([
    fetchTimeline(id, {
      track: effectiveTrack,
      dateFrom: sp.dateFrom ?? null,
      dateTo: sp.dateTo ?? null,
      provider: sp.provider ?? null,
    }),
    fetchFeatures(),
    fetchTimelineMeta(id),
  ]);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href={`/cases/${id}`} style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Case {id}
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Case timeline</h1>
      </div>

      <CaseTimelineTabs
        caseId={id}
        currentTrack={track}
        features={features}
        dateFrom={sp.dateFrom}
        dateTo={sp.dateTo}
        provider={sp.provider}
      />

      <RebuildTimelineBlock caseId={id} lastRebuiltAt={timelineMeta.lastRebuiltAt} />

      <TimelineFilters
        caseId={id}
        currentTrack={track}
        dateFrom={sp.dateFrom ?? ""}
        dateTo={sp.dateTo ?? ""}
        provider={sp.provider ?? ""}
      />

      {events.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14, marginTop: 16 }}>No timeline events in this track.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0 0" }}>
          {events.map((ev) => (
            <li
              key={ev.id}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #eee",
                fontSize: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background:
                      ev.track === "legal"
                        ? "#e8eaf6"
                        : ev.track === "insurance"
                          ? "#e3f2fd"
                          : "#f5f5f5",
                    color: "#333",
                  }}
                >
                  {ev.track}
                </span>
                {ev.eventDate && (
                  <span style={{ color: "#666" }}>
                    {new Date(ev.eventDate).toLocaleDateString()}
                  </span>
                )}
                <strong>{ev.eventType ?? "Event"}</strong>
                {ev.amount && <span style={{ color: "#066" }}>${ev.amount}</span>}
              </div>
              {(ev.provider || ev.diagnosis || ev.procedure) && (
                <div style={{ marginTop: 4, color: "#555", fontSize: 13 }}>
                  {[
                    ev.facilityId && ev.provider ? (
                      <Link
                        key="provider"
                        href={`/providers/${ev.facilityId}`}
                        style={{ color: "#06c", textDecoration: "underline" }}
                      >
                        {ev.provider}
                      </Link>
                    ) : (
                      ev.provider
                    ),
                    ev.diagnosis,
                    ev.procedure,
                  ]
                    .filter(Boolean)
                    .reduce<(React.ReactNode | string)[]>(
                      (acc, x, i) => (acc.length ? [...acc, " · ", x] : [x]),
                      []
                    )}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <Link
                  href={`/documents/${ev.documentId}`}
                  style={{ fontSize: 12, color: "#06c", textDecoration: "underline" }}
                >
                  View document
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
