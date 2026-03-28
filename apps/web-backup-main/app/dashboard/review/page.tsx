import Link from "next/link";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import ReviewQueueTable from "./ReviewQueueTable";
import RefreshButton from "../RefreshButton";

type DocumentRow = {
  id: string;
  fileName?: string | null;
  clientName?: string | null;
  suggestedCaseId?: string | null;
  routedCaseId?: string | null;
  matchConfidence?: number | null;
  extractedFields?: unknown;
  createdAt?: string;
  claimedBy?: string | null;
  [key: string]: unknown;
};

type CaseSummary = { id: string; caseNumber: string; title: string; clientName: string };

async function fetchReviewQueue(): Promise<{ items: DocumentRow[]; nextCursor: string | null }> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return { items: [], nextCursor: null };
  const res = await fetch(`${base}/me/review-queue?limit=50`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { items: [], nextCursor: null };
  const data = (await res.json().catch(() => ({}))) as { items?: DocumentRow[]; nextCursor?: string | null };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    nextCursor: data.nextCursor ?? null,
  };
}

async function fetchCases(): Promise<CaseSummary[]> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return [];
  const res = await fetch(`${base}/cases`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { items?: { id: string; title?: string | null; caseNumber?: string | null; clientName?: string | null }[] };
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber ?? String(c.id).slice(0, 12),
    title: c.title ?? "",
    clientName: c.clientName ?? "",
  }));
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

function casesFromDocs(docs: DocumentRow[]): CaseSummary[] {
  const seen = new Set<string>();
  const list: CaseSummary[] = [];
  for (const d of docs) {
    const id = d.suggestedCaseId ?? d.routedCaseId;
    if (id && !seen.has(id)) {
      seen.add(id);
      list.push({
        id,
        caseNumber: String(id).slice(0, 12),
        title: "",
        clientName: "",
      });
    }
  }
  return list;
}

function mergeCases(a: CaseSummary[], b: CaseSummary[]): CaseSummary[] {
  const byId = new Map<string, CaseSummary>();
  for (const c of a) byId.set(c.id, c);
  for (const c of b) if (!byId.has(c.id)) byId.set(c.id, c);
  return Array.from(byId.values());
}

export default async function ReviewPage() {
  const [{ items: documents, nextCursor }, features, allCases] = await Promise.all([
    fetchReviewQueue(),
    fetchFeatures(),
    fetchCases(),
  ]);
  const cases = mergeCases(casesFromDocs(documents), allCases);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Review queue" }]} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Review queue</h1>
        <RefreshButton ariaLabel="Refresh review queue" />
      </div>
      <ReviewQueueTable
        documents={documents}
        cases={cases}
        initialNextCursor={nextCursor}
        features={features}
      />
    </main>
  );
}
