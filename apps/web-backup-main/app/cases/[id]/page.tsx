import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { PageHeader } from "../../components/PageHeader";
import { formatTimestamp } from "../../lib/formatTimestamp";
import CopyCaseIdButton from "./CopyCaseIdButton";
import CaseDocumentsTab from "./CaseDocumentsTab";
import { CaseProvidersSection } from "./CaseProvidersSection";
import CaseTimelinePreview from "./CaseTimelinePreview";
import CaseRequestsTab from "./CaseRequestsTab";
import { RequestRecordsButton } from "./RequestRecordsButton";

type CaseItem = { id: string; title: string | null; caseNumber: string | null; clientName: string | null; status?: string | null; createdAt: string; updatedAt?: string };

async function fetchCase(caseId: string): Promise<CaseItem | null> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return null;
  const res = await fetch(`${base}/cases/${caseId}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; item?: CaseItem };
  return data.item ?? null;
}

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

  const [caseItem, firmId, timelineMeta, features, counts] = await Promise.all([
    fetchCase(id),
    fetchFirmId(),
    fetchTimelineMeta(id),
    fetchFeatures(),
    fetchCaseCounts(id),
  ]);

  const caseTitle = caseItem?.title || caseItem?.caseNumber || `Case #${id.slice(0, 8)}`;
  const clientName = caseItem?.clientName ?? "—";
  const caseNumber = caseItem?.caseNumber ?? "—";
  const caseStatus = caseItem?.status ?? "open";

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Cases", href: "/cases" },
          { label: `Case #${caseItem?.caseNumber ?? id.slice(0, 8)}` },
        ]}
      />

      <PageHeader
        title={caseTitle}
        description={`Client: ${clientName} · Case #${caseNumber}`}
        meta={caseItem?.updatedAt ? `Last updated: ${formatTimestamp(caseItem.updatedAt)}` : undefined}
      />

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          background: "#fafafa",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, fontSize: 14 }}>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Client</div>
            <div style={{ fontWeight: 600 }}>{clientName}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Status</div>
            <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{caseStatus}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Documents</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.documents}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Providers</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.providers}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Case number</div>
            <div style={{ fontWeight: 600 }}>{caseNumber}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Case ID</div>
            <CopyCaseIdButton caseId={id} />
          </div>
        </div>
      </section>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
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
        <RequestRecordsButton caseId={id} count={counts.requests} />
        <Link
          href={`/cases/${id}?tab=notes`}
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
          Notes ({counts.notes})
        </Link>
        <Link
          href={`/cases/${id}?tab=tasks`}
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
          Tasks ({counts.tasks})
        </Link>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32 }}>
        <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, background: "#fff" }}>
          <CaseDocumentsTab caseId={id} />
        </section>
        <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, background: "#fff" }}>
          <CaseProvidersSection caseId={id} />
        </section>
        <section>
          <CaseTimelinePreview caseId={id} />
        </section>
        <section
          id="records-requests"
          style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, background: "#fff" }}
        >
          <CaseRequestsTab caseId={id} />
        </section>
      </div>
    </main>
  );
}

