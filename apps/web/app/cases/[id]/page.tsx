import Link from "next/link";
import { notFound } from "next/navigation";
import CaseHubTabs from "./CaseHubTabs";

async function fetchFirmId(): Promise<string | null> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return null;
  const res = await fetch(`${base}/me/usage`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { firm?: { id?: string } };
  return data.firm?.id ?? null;
}

async function fetchTimelineMeta(caseId: string): Promise<{ lastRebuiltAt: string | null }> {
  const res = await fetch(
    `${process.env.DOC_WEB_BASE_URL ?? ""}/api/cases/${caseId}/timeline-meta`,
    { cache: "no-store" }
  ).catch(() => null);
  if (!res || !res.ok) return { lastRebuiltAt: null };
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; lastRebuiltAt?: string | null };
  return { lastRebuiltAt: data.lastRebuiltAt ?? null };
}

async function fetchFeatures(): Promise<{
  demand_narratives: boolean;
  case_insights: boolean;
  insurance_extraction: boolean;
  court_extraction: boolean;
}> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return { demand_narratives: false, case_insights: false, insurance_extraction: false, court_extraction: false };
  }
  const res = await fetch(`${base}/me/features`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) {
    return { demand_narratives: false, case_insights: false, insurance_extraction: false, court_extraction: false };
  }
  const data = (await res.json().catch(() => ({}))) as {
    demand_narratives?: boolean;
    case_insights?: boolean;
    insurance_extraction?: boolean;
    court_extraction?: boolean;
  };
  return {
    demand_narratives: Boolean(data.demand_narratives),
    case_insights: Boolean(data.case_insights),
    insurance_extraction: Boolean(data.insurance_extraction),
    court_extraction: Boolean(data.court_extraction),
  };
}

async function fetchCaseCounts(
  caseId: string
): Promise<{ documents: number; timeline: number; providers: number; requests: number; notes: number; tasks: number }> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return { documents: 0, timeline: 0, providers: 0, requests: 0, notes: 0, tasks: 0 };
  }
  const headers = { Authorization: `Bearer ${key}` };
  const opts = { headers, cache: "no-store" as RequestCache };

  const [docRes, tlRes, provRes, reqRes, notesRes, tasksRes] = await Promise.all([
    fetch(`${base}/cases/${caseId}/documents`, opts),
    fetch(`${base}/cases/${caseId}/timeline`, opts),
    fetch(`${base}/cases/${caseId}/providers`, opts),
    fetch(`${base}/cases/${caseId}/records-requests`, opts),
    fetch(`${base}/cases/${caseId}/notes`, opts),
    fetch(`${base}/cases/${caseId}/tasks`, opts),
  ]);

  const [documents, timeline, providers, requests, notes, tasks] = await Promise.all([
    docRes.json().then((d: { items?: unknown[] }) => (Array.isArray(d?.items) ? d.items.length : 0)).catch(() => 0),
    tlRes.json().then((d: { items?: unknown[] }) => (Array.isArray(d?.items) ? d.items.length : 0)).catch(() => 0),
    provRes.json().then((d: { items?: unknown[] }) => (Array.isArray(d?.items) ? d.items.length : 0)).catch(() => 0),
    reqRes.json().then((d: { items?: unknown[] }) => (Array.isArray(d?.items) ? d.items.length : 0)).catch(() => 0),
    notesRes.json().then((d: { items?: unknown[] }) => (Array.isArray(d?.items) ? d.items.length : 0)).catch(() => 0),
    tasksRes.json().then((d: { items?: unknown[] }) => (Array.isArray(d?.items) ? d.items.length : 0)).catch(() => 0),
  ]);

  return { documents, timeline, providers, requests, notes, tasks };
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const [firmId, timelineMeta, features, counts] = await Promise.all([
    fetchFirmId(),
    fetchTimelineMeta(id),
    fetchFeatures(),
    fetchCaseCounts(id),
  ]);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Case Hub</h1>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>Case {id}</p>

      <CaseHubTabs
        caseId={id}
        firmId={firmId}
        timelineMeta={timelineMeta}
        features={features}
        counts={counts}
      />

      <section style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Link
          href={`/cases/${id}/offers`}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Settlement Offers
        </Link>
        <Link
          href={`/cases/${id}/narrative`}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            color: "#111",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Demand Narrative
        </Link>
        <Link
          href={`/cases/${id}/timeline`}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            color: "#111",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Full Timeline
        </Link>
      </section>
    </main>
  );
}

