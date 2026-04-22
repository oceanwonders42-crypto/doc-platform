"use client";

import { useEffect, useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type TrendPoint = { day: string; docsProcessed: number; recordsRequests: number };
type Summary = {
  docsProcessedThisMonth: number;
  pagesProcessedThisMonth: number;
  unmatchedDocs: number;
  needsReviewDocs: number;
  recordsRequestsCreatedThisMonth: number;
  notificationsUnread: number;
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [caseCount, setCaseCount] = useState(0);
  const [providerCount, setProviderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = getApiBase();
    Promise.all([
      fetch(`${base}/me/metrics-summary`, { ...getFetchOptions(), headers: getAuthHeader() }).then(parseJsonResponse),
      fetch(`${base}/cases`, { ...getFetchOptions(), headers: getAuthHeader() }).then(parseJsonResponse),
      fetch(`${base}/providers`, { ...getFetchOptions(), headers: getAuthHeader() }).then(parseJsonResponse),
    ])
      .then(([metricsRes, casesRes, providersRes]) => {
        const m = metricsRes as { ok?: boolean; summary?: Summary; trend?: TrendPoint[] };
        if (m.ok && m.summary) setSummary(m.summary);
        if (m.ok && m.trend) setTrend(m.trend);
        const c = casesRes as { ok?: boolean; items?: unknown[] };
        if (c.ok && Array.isArray(c.items)) setCaseCount(c.items.length);
        const p = providersRes as { items?: unknown[] };
        if (p.items) setProviderCount(p.items.length);
        if (!m.ok) setError((m as { error?: string }).error ?? "Failed to load");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !summary) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Analytics" }]} title="Analytics" description="Loading…" />
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading analytics…</p>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Analytics" }]} title="Analytics" />
        <div className="onyx-card" style={{ padding: "1.25rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Check your connection and try again.</p>
        </div>
      </div>
    );
  }

  const maxDocs = Math.max(1, ...trend.map((t) => t.docsProcessed));
  const maxRecs = Math.max(1, ...trend.map((t) => t.recordsRequests));

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Analytics" }]}
        title="Analytics"
        description="Platform usage and processing metrics"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <DashboardCard>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Documents processed</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{summary?.docsProcessedThisMonth ?? 0}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>This month</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Cases</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{caseCount}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Providers</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{providerCount}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Records requests</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{summary?.recordsRequestsCreatedThisMonth ?? 0}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>This month</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Needs review</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{summary?.needsReviewDocs ?? 0}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Documents in review queue</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Unmatched</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{summary?.unmatchedDocs ?? 0}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Documents not yet routed</p>
        </DashboardCard>
      </div>

      {trend.length === 0 ? (
        <DashboardCard title="30-day trend">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No trend data for this period yet. Data will appear as documents are processed.</p>
        </DashboardCard>
      ) : (
        <DashboardCard title="30-day trend">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {trend.slice(-14).map((t) => (
              <div key={t.day} style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.875rem" }}>
                <span style={{ width: 80, color: "var(--onyx-text-muted)" }}>{t.day}</span>
                <div style={{ flex: 1, display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <div style={{ flex: 1, maxWidth: 200, height: 8, background: "var(--onyx-border)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(t.docsProcessed / maxDocs) * 100}%`, height: "100%", background: "var(--onyx-accent)", borderRadius: 4 }} />
                  </div>
                  <span style={{ width: 32 }}>{t.docsProcessed}</span>
                </div>
                <span style={{ width: 40, color: "var(--onyx-text-muted)" }}>RR: {t.recordsRequests}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Docs processed (bar) · RR = records requests</p>
        </DashboardCard>
      )}
    </div>
  );
}
