import type { Metadata } from "next";
import Link from "next/link";
import ProvidersTable from "./ProvidersTable";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageHeader } from "../components/PageHeader";

export const metadata: Metadata = { title: "Providers" };
export const dynamic = "force-dynamic";

type Provider = {
  id: string;
  name: string;
  city: string;
  state: string;
  phone?: string | null;
};

type ProvidersResponse = {
  items: Provider[];
};

async function fetchProviders(q?: string): Promise<ProvidersResponse> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.DOC_WEB_BASE_URL || "http://localhost:3000";
  const sp = new URLSearchParams();
  if (q?.trim()) sp.set("q", q.trim());
  const qs = sp.toString();
  const url = qs ? `${base}/api/providers?${qs}` : `${base}/api/providers`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  return res.json();
}

const PAGE_SIZE = 25;

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const data = await fetchProviders(params.q);
  const items = data.items ?? [];
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginatedItems = items.slice(start, start + PAGE_SIZE);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Providers" }]} />
      <PageHeader
        title="Providers"
        description="Clinics and healthcare providers. Search and filter to find providers to link to cases."
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
            {items.length}
          </span>
        }
      />

      <ProvidersTable
        items={paginatedItems}
        totalCount={items.length}
        page={currentPage}
        pageSize={PAGE_SIZE}
        totalPages={totalPages}
        searchQuery={params.q ?? ""}
      />
    </main>
  );
}
