import type { Metadata } from "next";
import Link from "next/link";
import CasesListWithSearch from "./CasesListWithSearch";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageHeader } from "../components/PageHeader";

export const metadata: Metadata = { title: "Cases" };

type CaseItem = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
  status?: string | null;
  createdAt?: string;
};

type ProviderItem = { id: string; name: string };

async function fetchCases(providerId?: string | null): Promise<CaseItem[]> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return [];
  const url = providerId ? `${base}/cases?providerId=${encodeURIComponent(providerId)}` : `${base}/cases`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    items?: CaseItem[];
  };
  return Array.isArray(data?.items) ? data.items : [];
}

async function fetchProviders(): Promise<ProviderItem[]> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return [];
  const res = await fetch(`${base}/providers`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { items?: { id: string; name: string }[] };
  return Array.isArray(data?.items) ? data.items : [];
}

export const dynamic = "force-dynamic";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const params = await searchParams;
  const providerId = params?.provider?.trim() || null;
  const [cases, providers] = await Promise.all([
    fetchCases(providerId),
    fetchProviders(),
  ]);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Cases" }]} />
      <PageHeader
        title="Cases"
        description="View and manage all cases. Filter by provider to find cases linked to a specific provider."
        actions={
          <span
            style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              background: "#e5e5e5",
              color: "#444",
            }}
          >
            {cases.length}
          </span>
        }
      />

      <CasesListWithSearch
        cases={cases}
        providers={providers}
        currentProviderId={providerId}
      />
    </main>
  );
}
