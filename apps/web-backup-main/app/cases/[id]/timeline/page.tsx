import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "../../../components/EmptyState";
import { formatDate } from "../../../lib/formatTimestamp";
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

type TimelineEvent = {
  id: string;
  eventDate: string | null;
  eventType: string | null;
  facility: string | null;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | null;
  documentId: string;
  track?: string;
  facilityId?: string | null;
  metadataJson?: unknown;
  createdAt?: string;
};

async function fetchTimeline(caseId: string, filters: TimelineFilters): Promise<TimelineEvent[]> {
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
          ← Back to case
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
        <EmptyState
          title="No timeline events yet"
          description="Upload documents to the case, then use Rebuild timeline above to extract medical, legal, and insurance events. If you have filters applied, try clearing them."
          action={{ label: "Back to case", href: `/cases/${id}` }}
          compact
        />
      ) : (
        <div
          style={{
            position: "relative",
            marginTop: 24,
            paddingLeft: 32,
            borderLeft: "2px solid #e0e0e0",
            marginLeft: 8,
          }}
        >
          {events.map((ev, idx) => {
            const providerOrFacility = ev.provider ?? ev.facility ?? null;
            const diagnosisOrProcedure = ev.diagnosis ?? ev.procedure ?? null;
            return (
              <div
                key={ev.id}
                style={{
                  position: "relative",
                  marginBottom: idx < events.length - 1 ? 28 : 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -40,
                    top: 4,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background:
                      ev.track === "legal"
                        ? "#5c6bc0"
                        : ev.track === "insurance"
                          ? "#42a5f5"
                          : "#66bb6a",
                    border: "2px solid #fff",
                    boxShadow: "0 0 0 2px #e0e0e0",
                  }}
                />
                <div
                  style={{
                    padding: "14px 18px",
                    background: "#fff",
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    {ev.eventDate && (
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>
                        {formatDate(ev.eventDate)}
                      </span>
                    )}
                    {ev.eventType && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background:
                            ev.track === "legal"
                              ? "#e8eaf6"
                              : ev.track === "insurance"
                                ? "#e3f2fd"
                                : "#e8f5e9",
                          color: "#333",
                        }}
                      >
                        {ev.eventType}
                      </span>
                    )}
                    {ev.amount && (
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#2e7d32" }}>
                        ${ev.amount}
                      </span>
                    )}
                  </div>
                  {providerOrFacility && (
                    <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>
                      {ev.facilityId && ev.provider ? (
                        <Link
                          href={`/providers/${ev.facilityId}`}
                          style={{ color: "#1565c0", textDecoration: "underline" }}
                        >
                          {providerOrFacility}
                        </Link>
                      ) : (
                        providerOrFacility
                      )}
                    </div>
                  )}
                  {diagnosisOrProcedure && (
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                      {diagnosisOrProcedure}
                    </div>
                  )}
                  <Link
                    href={`/documents/${ev.documentId}`}
                    style={{
                      fontSize: 13,
                      color: "#1565c0",
                      textDecoration: "underline",
                      fontWeight: 500,
                    }}
                  >
                    View source document →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
