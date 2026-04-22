"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DataTable, Column } from "@/components/dashboard/DataTable";
import { ProviderForm } from "@/components/dashboard/ProviderForm";
import { InviteProviderButton } from "@/components/dashboard/InviteProviderButton";
import { useDashboardAuth } from "@/contexts/DashboardAuthContext";

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
  verified?: boolean | null;
  subscriptionTier?: string | null;
  createdAt?: string | null;
};

type CaseLink = { id: string; title: string | null; caseNumber: string | null; clientName: string | null; relationship?: string | null };
type RecordsRequest = { id: string; providerName: string | null; status: string; caseId: string | null; createdAt: string };
type TimelineEvent = { id: string; eventDate: string | null; eventType: string | null; track: string | null; provider: string | null; documentId: string | null; caseId: string | null };

type ProviderSummaryResponse = {
  ok?: boolean;
  error?: string;
  provider?: Provider;
  cases?: CaseLink[];
  recordsRequests?: RecordsRequest[];
  timelineEvents?: TimelineEvent[];
};

function formatStatus(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function isFirmAdminOrPlatform(role: string | null) {
  return role === "FIRM_ADMIN" || role === "PLATFORM_ADMIN";
}

export default function ProviderDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { role } = useDashboardAuth();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [cases, setCases] = useState<CaseLink[]>([]);
  const [recordsRequests, setRecordsRequests] = useState<RecordsRequest[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadProviderSummary() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${getApiBase()}/providers/${id}/summary`, {
          headers: { ...getAuthHeader(), Accept: "application/json" },
          ...getFetchOptions(),
        });
        const data = (await parseJsonResponse(response)) as ProviderSummaryResponse;
        if (!response.ok || !data.ok || !data.provider) {
          throw new Error(data.error ?? "Failed to load provider.");
        }
        setProvider(data.provider);
        setCases(Array.isArray(data.cases) ? data.cases : []);
        setRecordsRequests(Array.isArray(data.recordsRequests) ? data.recordsRequests : []);
        setTimelineEvents(Array.isArray(data.timelineEvents) ? data.timelineEvents : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed.");
      } finally {
        setLoading(false);
      }
    }

    void loadProviderSummary();
  }, [id]);

  if (loading && !provider) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: "Providers", href: "/dashboard/providers" }, { label: "..." }]} title="Provider" description="Loading provider details..." />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: "Providers", href: "/dashboard/providers" }]} title="Provider" />
        <div className="onyx-card" style={{ padding: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error ?? "Provider not found."}</p>
          <Link href="/dashboard/providers" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>
            Back to providers
          </Link>
        </div>
      </div>
    );
  }

  const name = provider.name ?? provider.id;
  const canInvite = isFirmAdminOrPlatform(role);
  const caseColumns: Column<CaseLink>[] = [
    { key: "client", header: "Client", render: (row) => row.clientName ?? row.title ?? "-" },
    { key: "caseNumber", header: "Case #", render: (row) => row.caseNumber ?? "-" },
    { key: "relationship", header: "Relationship", render: (row) => row.relationship ?? "-" },
    { key: "action", header: "", render: (row) => <Link href={`/dashboard/cases/${row.id}`} className="onyx-link">View</Link> },
  ];

  const requestColumns: Column<RecordsRequest>[] = [
    { key: "providerName", header: "Request", render: (row) => <Link href={`/dashboard/records-requests/${row.id}`} className="onyx-link">{row.providerName ?? "Records request"}</Link> },
    { key: "status", header: "Status", render: (row) => formatStatus(row.status) },
    { key: "case", header: "Case", render: (row) => row.caseId ? <Link href={`/dashboard/cases/${row.caseId}`} className="onyx-link">View</Link> : "-" },
    { key: "created", header: "Created", render: (row) => formatDate(row.createdAt) },
  ];

  const timelineColumns: Column<TimelineEvent>[] = [
    { key: "eventDate", header: "Date", render: (row) => formatDate(row.eventDate) },
    { key: "eventType", header: "Type", render: (row) => formatStatus(row.eventType) },
    { key: "track", header: "Track", render: (row) => row.track ?? "-" },
    { key: "case", header: "Case", render: (row) => row.caseId ? <Link href={`/dashboard/cases/${row.caseId}`} className="onyx-link">View</Link> : "-" },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Providers", href: "/dashboard/providers" }, { label: name }]}
        title={name}
        description={provider.specialty ?? "Provider contact details, linked cases, and records-request activity"}
        action={
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/dashboard/providers" className="onyx-link" style={{ fontSize: "0.875rem", alignSelf: "center" }}>
              Back to providers
            </Link>
            <Link href={`/dashboard/records-requests/new?providerId=${provider.id}`} className="onyx-btn-secondary" style={{ textDecoration: "none" }}>
              New records request
            </Link>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <DashboardCard title="Contact">
          <p style={{ margin: 0, fontSize: "0.875rem" }}>{provider.address ?? "-"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>{[provider.city, provider.state].filter(Boolean).join(", ") || "-"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>Phone: {provider.phone || "-"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>Fax: {provider.fax || "-"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>Email: {provider.email || "-"}</p>
        </DashboardCard>

        <DashboardCard title="Operational summary">
          <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Verified:</strong> {provider.verified ? "Yes" : "No"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Subscription:</strong> {provider.subscriptionTier ?? "-"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Created:</strong> {formatDate(provider.createdAt)}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Linked cases:</strong> {cases.length}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Records requests:</strong> {recordsRequests.length}</p>
        </DashboardCard>

        <DashboardCard title="Quick actions">
          <p style={{ margin: "0 0 0.875rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
            Keep provider details current, then use this record from case and records-request workflows.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Link href={`/dashboard/records-requests/new?providerId=${provider.id}`} className="onyx-btn-primary" style={{ textDecoration: "none", textAlign: "center" }}>
              Start records request
            </Link>
            <Link href="/dashboard/providers/new" className="onyx-btn-secondary" style={{ textDecoration: "none", textAlign: "center" }}>
              Add another provider
            </Link>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard title="Manage provider" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
          Update contact and specialty details here so downstream records-request workflows use the current provider data.
        </p>
        <ProviderForm
          mode="edit"
          providerId={provider.id}
          initialValues={{
            name: provider.name ?? "",
            address: provider.address ?? "",
            city: provider.city ?? "",
            state: provider.state ?? "",
            phone: provider.phone ?? "",
            fax: provider.fax ?? "",
            email: provider.email ?? "",
            specialty: provider.specialty ?? "",
          }}
          onSuccess={(updated) => {
            setProvider((current) => (current ? { ...current, ...updated } : updated));
          }}
        />
      </DashboardCard>

      {canInvite && (
        <DashboardCard title="Provider access" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
            Firm admins can invite a provider user to manage this listing. The active API already supports direct invite creation for this provider.
          </p>
          <InviteProviderButton providerId={provider.id} defaultEmail={provider.email} />
        </DashboardCard>
      )}

      <DashboardCard title="Related cases" style={{ marginBottom: "1rem" }}>
        {cases.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No cases linked yet.</p>
        ) : (
          <DataTable columns={caseColumns} data={cases} emptyMessage="No linked cases." />
        )}
      </DashboardCard>

      <DashboardCard title="Records requests" style={{ marginBottom: "1rem" }}>
        {recordsRequests.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No records requests yet.</p>
        ) : (
          <DataTable columns={requestColumns} data={recordsRequests} emptyMessage="No records requests." />
        )}
      </DashboardCard>

      <DashboardCard title="Recent timeline activity">
        {timelineEvents.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No recent timeline events for this provider.</p>
        ) : (
          <DataTable columns={timelineColumns} data={timelineEvents} emptyMessage="No recent timeline events." />
        )}
      </DashboardCard>
    </div>
  );
}
