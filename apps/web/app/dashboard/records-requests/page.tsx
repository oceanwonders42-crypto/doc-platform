"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
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
};

type CaseOption = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
};

type ProviderOption = {
  id: string;
  name: string;
};

function statusBadgeClass(status: string): string {
  if (status === "COMPLETED") return "onyx-badge onyx-badge-success";
  if (status === "FAILED") return "onyx-badge onyx-badge-error";
  if (status === "SENT" || status === "RECEIVED") return "onyx-badge onyx-badge-info";
  if (status === "FOLLOW_UP_DUE") return "onyx-badge onyx-badge-warning";
  return "onyx-badge onyx-badge-neutral";
}

export default function RecordsRequestsDashboardPage() {
  const apiBase = getApiBase();
  const apiReady = Boolean(apiBase);
  const [dashboard, setDashboard] = useState<DashboardCounts | null>(null);
  const [requests, setRequests] = useState<RecordsRequest[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCaseId, setFilterCaseId] = useState("");
  const [filterProviderId, setFilterProviderId] = useState("");
  const [followUpId, setFollowUpId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!apiReady) {
      setError("Records requests need a configured API target before the dashboard can load.");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterCaseId) params.set("caseId", filterCaseId);
    if (filterProviderId) params.set("providerId", filterProviderId);

    setLoading(true);
    setError(null);

    void Promise.all([
      fetch(`${apiBase}/records-requests/dashboard`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      }).then(parseJsonResponse),
      fetch(`${apiBase}/records-requests${params.toString() ? `?${params.toString()}` : ""}`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      }).then(parseJsonResponse),
      fetch(`${apiBase}/cases`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      })
        .then(parseJsonResponse)
        .catch(() => ({ ok: false, items: [] })),
      fetch(`${apiBase}/providers`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      })
        .then(parseJsonResponse)
        .catch(() => ({ ok: false, items: [] })),
    ])
      .then(([dashRes, listRes, casesRes, providersRes]) => {
        const dash = dashRes as { ok?: boolean; dashboard?: DashboardCounts; error?: string };
        const list = listRes as { ok?: boolean; requests?: RecordsRequest[]; error?: string };
        const casePayload = casesRes as { ok?: boolean; items?: CaseOption[] };
        const providerPayload = providersRes as { ok?: boolean; items?: ProviderOption[] };

        if (!dash.ok) {
          setError(dash.error ?? "Failed to load records request metrics.");
          return;
        }
        if (!list.ok) {
          setError(list.error ?? "Failed to load records requests.");
          return;
        }

        setDashboard(dash.dashboard ?? null);
        setRequests(list.requests ?? []);
        if (casePayload.ok && Array.isArray(casePayload.items)) setCases(casePayload.items);
        if (providerPayload.ok && Array.isArray(providerPayload.items)) setProviders(providerPayload.items);
      })
      .catch((nextError) => {
        setError(formatApiClientError(nextError, "Request failed"));
      })
      .finally(() => setLoading(false));
  }, [apiBase, apiReady, filterCaseId, filterProviderId, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFollowUp(id: string) {
    if (!apiReady) {
      setError("Records requests need a configured API target before follow-up can be sent.");
      return;
    }

    setFollowUpId(id);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/records-requests/${id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({}),
      });
      const data = (await parseJsonResponse(response)) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Follow-up failed.");
        return;
      }
      load();
    } catch (nextError) {
      setError(formatApiClientError(nextError, "Follow-up failed."));
    } finally {
      setFollowUpId(null);
    }
  }

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Records requests" }]}
        title="Records requests"
        description="Create drafts, generate PDFs, send requests, and track follow-up from one place."
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

      {!apiReady && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-warning)" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>API target required</p>
          <p style={{ margin: "0.5rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            The records requests dashboard depends on the JSON API target for listing requests, generating letters, and sending follow-up.
          </p>
        </div>
      )}

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

      {loading ? (
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading records requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="onyx-card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: "32rem" }}>
          <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--onyx-text)" }}>
            {filterStatus || filterCaseId || filterProviderId ? "No requests match your filters." : "No records requests yet"}
          </p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            {filterStatus || filterCaseId || filterProviderId
              ? "Clear one or more filters and try again."
              : "Create the first draft to start the request, PDF, and send workflow."}
          </p>
          <Link
            href="/dashboard/records-requests/new"
            className="onyx-btn-primary"
            style={{ display: "inline-block", marginTop: "1rem", textDecoration: "none" }}
          >
            Create first request
          </Link>
          {(filterStatus || filterCaseId || filterProviderId) && (
            <button
              type="button"
              onClick={() => {
                setFilterStatus("");
                setFilterCaseId("");
                setFilterProviderId("");
              }}
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
                onChange={(event) => setFilterStatus(event.target.value)}
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
                onChange={(event) => setFilterCaseId(event.target.value)}
                className="onyx-input"
                style={{ minWidth: 200 }}
              >
                <option value="">All cases</option>
                {cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.caseNumber || item.title || item.id.slice(0, 8)}
                    {item.clientName ? ` (${item.clientName})` : ""}
                  </option>
                ))}
              </select>
              <select
                value={filterProviderId}
                onChange={(event) => setFilterProviderId(event.target.value)}
                className="onyx-input"
                style={{ minWidth: 200 }}
              >
                <option value="">All providers</option>
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={load}
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const isFollowUpDue = request.status === "FOLLOW_UP_DUE";
                  const canFollowUp = request.status === "SENT" || request.status === "FOLLOW_UP_DUE";
                  return (
                    <tr
                      key={request.id}
                      style={
                        isFollowUpDue
                          ? { borderLeft: "3px solid var(--onyx-warning)", background: "rgba(234, 179, 8, 0.06)" }
                          : undefined
                      }
                    >
                      <td style={{ fontWeight: 500 }}>{request.providerName}</td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>{request.requestType ?? "-"}</td>
                      <td>
                        <span className={statusBadgeClass(request.status)} title={isFollowUpDue ? "Follow-up is due" : undefined}>
                          {request.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>
                        {request.sentAt ? new Date(request.sentAt).toLocaleDateString() : "-"}
                      </td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>
                        {request.dueAt ? new Date(request.dueAt).toLocaleDateString() : "-"}
                      </td>
                      <td style={{ color: "var(--onyx-text-muted)" }}>{request.followUpCount ?? 0}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          {canFollowUp && (
                            <button
                              type="button"
                              onClick={() => handleFollowUp(request.id)}
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
                              {followUpId === request.id ? "Sending..." : "Follow-up"}
                            </button>
                          )}
                          <Link href={`/dashboard/records-requests/${request.id}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
