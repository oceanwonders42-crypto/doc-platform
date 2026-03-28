"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatsWidget } from "@/components/dashboard/StatsWidget";

type DashboardCounts = {
  open: number;
  sent: number;
  followUpDue: number;
  received: number;
  failed: number;
  completedThisWeek: number;
};

type RecordsRequest = {
  id: string;
  caseId: string;
  providerId: string | null;
  providerName: string;
  status: string;
  requestType: string | null;
  destinationType: string | null;
  subject: string | null;
  sentAt: string | null;
  dueAt: string | null;
  followUpCount?: number | null;
  lastFollowUpAt?: string | null;
  createdAt: string;
  attachments?: { id: string; kind: string; documentId: string }[];
};

type CaseOption = { id: string; title: string | null; caseNumber: string | null; clientName: string | null };
type ProviderOption = { id: string; name: string };

function statusBadgeClass(status: string): string {
  if (status === "COMPLETED") return "onyx-badge onyx-badge-success";
  if (status === "FAILED") return "onyx-badge onyx-badge-error";
  if (status === "SENT" || status === "RECEIVED") return "onyx-badge onyx-badge-info";
  if (status === "FOLLOW_UP_DUE") return "onyx-badge onyx-badge-warning";
  return "onyx-badge onyx-badge-neutral";
}

export default function RecordsRequestsDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardCounts | null>(null);
  const [requests, setRequests] = useState<RecordsRequest[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCaseId, setFilterCaseId] = useState<string>("");
  const [filterProviderId, setFilterProviderId] = useState<string>("");
  const [followUpId, setFollowUpId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterCaseId) params.set("caseId", filterCaseId);
    if (filterProviderId) params.set("providerId", filterProviderId);
    Promise.all([
      fetch(`${getApiBase()}/records-requests/dashboard`, { headers: getAuthHeader(), ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${getApiBase()}/records-requests?${params.toString()}`, { headers: getAuthHeader(), ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${getApiBase()}/cases`, { headers: getAuthHeader(), ...getFetchOptions() }).then(parseJsonResponse).catch(() => ({ ok: false, items: [] })),
      fetch(`${getApiBase()}/providers`, { headers: getAuthHeader(), ...getFetchOptions() }).then(parseJsonResponse).catch(() => ({ ok: false, items: [] })),
    ])
      .then(([dashRes, listRes, casesRes, providersRes]) => {
        const dash = dashRes as { ok?: boolean; dashboard?: DashboardCounts; error?: string };
        const list = listRes as { ok?: boolean; requests?: RecordsRequest[] };
        const c = casesRes as { ok?: boolean; items?: CaseOption[] };
        const p = providersRes as { ok?: boolean; items?: ProviderOption[] };
        if (dash.ok) setDashboard(dash.dashboard ?? null);
        if (list.ok) setRequests(list.requests ?? []);
        if (c?.ok && Array.isArray(c.items)) setCases(c.items);
        if (p?.ok && Array.isArray(p.items)) setProviders(p.items);
        if (!dash.ok) setError(dash.error ?? "Failed to load");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [filterStatus, filterCaseId, filterProviderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFollowUp(id: string) {
    setFollowUpId(id);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (data.ok) load();
      else setError(data.error ?? "Follow-up failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setFollowUpId(null);
    }
  }

  if (loading && !dashboard) {
    return (
      <div style={{ padding: "0 1.5rem 1.5rem" }}>
        <PageHeader
          breadcrumbs={[{ label: "Records requests" }]}
          title="Records requests"
          description="Loading…"
        />
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
      </div>
    );
  }
  if (error && !dashboard) {
    return (
      <div style={{ padding: "0 1.5rem 1.5rem" }}>
        <PageHeader
          breadcrumbs={[{ label: "Records requests" }]}
          title="Records requests"
        />
        <div className="onyx-card" style={{ padding: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="onyx-link"
            style={{ marginTop: "0.5rem", fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Records requests" }]}
        title="Records requests"
        description="Request and track medical records and bills from providers"
        action={
          <Link
            href="/dashboard/records-requests/new"
            className="onyx-btn-primary"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            New request
          </Link>
        }
      />

      {dashboard && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <StatsWidget label="Open" value={dashboard.open} />
          <StatsWidget label="Sent" value={dashboard.sent} />
          <StatsWidget
            label="Follow-up due"
            value={dashboard.followUpDue}
            subtext={dashboard.followUpDue > 0 ? "Needs attention" : undefined}
          />
          <StatsWidget label="Received" value={dashboard.received} />
          <StatsWidget label="Failed" value={dashboard.failed} />
          <StatsWidget label="Completed (7d)" value={dashboard.completedThisWeek} />
        </div>
      )}

      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="onyx-card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: "28rem" }}>
          <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: "var(--onyx-text)" }}>
            {filterStatus || filterCaseId || filterProviderId ? "No requests match your filters." : "No records requests yet"}
          </p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            {filterStatus || filterCaseId || filterProviderId ? "Try changing or clearing filters." : "Create a request to get started."}
          </p>
          <Link
            href="/dashboard/records-requests/new"
            className="onyx-btn-primary"
            style={{ display: "inline-block", marginTop: "1rem", textDecoration: "none" }}
          >
            New request
          </Link>
          {(filterStatus || filterCaseId || filterProviderId) && (
            <button
              type="button"
              onClick={() => { setFilterStatus(""); setFilterCaseId(""); setFilterProviderId(""); }}
              className="onyx-btn-secondary"
              style={{ display: "block", margin: "0.5rem auto 0" }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
      <div className="onyx-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "1rem 1rem 0" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600 }}>Requests</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 140 }}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="FOLLOW_UP_DUE">Follow-up due</option>
              <option value="RECEIVED">Received</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              value={filterCaseId}
              onChange={(e) => setFilterCaseId(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 180 }}
            >
              <option value="">All cases</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber || c.title || c.id.slice(0, 8)} {c.clientName ? `(${c.clientName})` : ""}
                </option>
              ))}
            </select>
            <select
              value={filterProviderId}
              onChange={(e) => setFilterProviderId(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 180 }}
            >
              <option value="">All providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => load()}
              className="onyx-link"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem" }}
            >
              Refresh
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="onyx-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Type</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Due</th>
                <th>Follow-ups</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--onyx-text-muted)" }}>
                    No requests match your filters.
                  </td>
                </tr>
              ) : (
                requests.map((r) => {
                  const isFollowUpDue = r.status === "FOLLOW_UP_DUE";
                  const canFollowUp = r.status === "SENT" || r.status === "FOLLOW_UP_DUE";
                  return (
                    <tr
                      key={r.id}
                      style={
                        isFollowUpDue
                          ? { borderLeft: "3px solid var(--onyx-warning)", background: "rgba(234, 179, 8, 0.06)" }
                          : undefined
                      }
                    >
                      <td style={{ fontWeight: 500 }}>{r.providerName}</td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>{r.requestType ?? "—"}</td>
                      <td>
                        <span className={statusBadgeClass(r.status)} title={isFollowUpDue ? "Follow-up is due" : undefined}>
                          {r.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>
                        {r.sentAt ? new Date(r.sentAt).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>
                        {r.dueAt ? new Date(r.dueAt).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>{r.followUpCount ?? 0}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          {canFollowUp && (
                            <button
                              type="button"
                              onClick={() => handleFollowUp(r.id)}
                              disabled={followUpId !== null}
                              className="onyx-link"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: followUpId !== null ? "not-allowed" : "pointer",
                                opacity: followUpId !== null ? 0.5 : 1,
                                fontSize: "0.875rem",
                              }}
                            >
                              {followUpId === r.id ? "Sending…" : "Follow-up"}
                            </button>
                          )}
                          <Link href={`/dashboard/records-requests/${r.id}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
