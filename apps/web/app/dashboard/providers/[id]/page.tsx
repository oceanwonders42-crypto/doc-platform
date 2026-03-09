"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type Provider = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  specialty: string | null;
};

type CaseLink = { id: string; title: string | null; caseNumber: string | null; clientName: string | null; relationship?: string };
type RecordsRequest = { id: string; providerName: string; status: string; caseId: string; createdAt: string };

export default function ProviderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [provider, setProvider] = useState<Provider | null>(null);
  const [cases, setCases] = useState<CaseLink[]>([]);
  const [recordsRequests, setRecordsRequests] = useState<RecordsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const base = getApiBase();
    const headers = { ...getAuthHeader(), Accept: "application/json" };
    Promise.all([
      fetch(`${base}/providers/${id}`, { headers }).then(parseJsonResponse),
      fetch(`${base}/providers/${id}/cases`, { headers }).then(parseJsonResponse),
      fetch(`${base}/providers/${id}/summary`, { headers }).then(parseJsonResponse).catch(() => ({ ok: false })),
    ])
      .then(([provRes, casesRes, summaryRes]) => {
        if (provRes && typeof (provRes as Provider).id === "string") setProvider(provRes as Provider);
        const c = casesRes as { ok?: boolean; items?: CaseLink[] };
        if (c.ok && c.items) setCases(c.items);
        const s = summaryRes as { ok?: boolean; recordsRequests?: RecordsRequest[] };
        if (s.ok && s.recordsRequests) setRecordsRequests(s.recordsRequests);
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading && !provider) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: "Providers", href: "/dashboard/providers" }, { label: "…" }]} title="Provider" description="Loading…" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: "Providers", href: "/dashboard/providers" }]} title="Provider" />
        <div className="onyx-card" style={{ padding: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error ?? "Provider not found."}</p>
          <Link href="/dashboard/providers" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>Back to providers</Link>
        </div>
      </div>
    );
  }

  const name = provider.name ?? provider.id;
  const caseColumns: Column<CaseLink>[] = [
    { key: "client", header: "Client", render: (row) => row.clientName ?? row.title ?? "—" },
    { key: "caseNumber", header: "Case #", render: (row) => row.caseNumber ?? "—" },
    { key: "action", header: "", render: (row) => <Link href={`/dashboard/cases/${row.id}`} className="onyx-link">View</Link> },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Providers", href: "/dashboard/providers" }, { label: name }]}
        title={name}
        description={provider.specialty ?? undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <DashboardCard title="Contact">
          <p style={{ margin: 0, fontSize: "0.875rem" }}>{provider.address ?? "—"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>{[provider.city, provider.state].filter(Boolean).join(", ") || "—"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>Phone: {provider.phone ?? "—"}</p>
          {provider.email && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>Email: {provider.email}</p>}
        </DashboardCard>
        <DashboardCard title="Counts">
          <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Cases:</strong> {cases.length}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Records requests:</strong> {recordsRequests.length}</p>
        </DashboardCard>
      </div>

      <DashboardCard title="Related cases" style={{ marginBottom: "1rem" }}>
        {cases.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No cases linked.</p>
        ) : (
          <DataTable columns={caseColumns} data={cases} emptyMessage="No cases" />
        )}
      </DashboardCard>

      {recordsRequests.length > 0 && (
        <DashboardCard title="Records requests">
          <DataTable
            columns={[
              { key: "status", header: "Status", render: (r) => r.status },
              { key: "case", header: "Case", render: (r) => r.caseId ? <Link href={`/dashboard/cases/${r.caseId}`} className="onyx-link">View</Link> : "—" },
              { key: "created", header: "Created", render: (r) => new Date(r.createdAt).toLocaleDateString() },
            ]}
            data={recordsRequests}
          />
        </DashboardCard>
      )}
    </div>
  );
}
