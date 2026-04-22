"use client";

import { useEffect, useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type UsageRes = {
  ok?: boolean;
  docsProcessed?: number;
  pagesProcessed?: number;
  updatedAt?: string | null;
};

function isUsageRes(res: unknown): res is UsageRes {
  return typeof res === "object" && res !== null;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = getApiBase();
    fetch(`${base}/me/usage`, { ...getFetchOptions(), headers: getAuthHeader() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isUsageRes(res) && (res.ok !== false || res.docsProcessed != null)) setUsage(res);
        else setError("Failed to load usage");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !usage) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Usage" }]} title="Usage" description="Loading…" />
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading usage…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Usage" }]}
        title="Usage"
        description="Current period usage and limits"
      />
      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Check your connection and try again.</p>
        </div>
      )}
      {usage ? (
        <DashboardCard title="This month">
          <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Documents processed:</strong> {usage.docsProcessed ?? 0}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Pages processed:</strong> {usage.pagesProcessed ?? 0}</p>
          {usage.updatedAt && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Updated: {new Date(usage.updatedAt).toLocaleString()}</p>}
        </DashboardCard>
      ) : !error ? (
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--onyx-text)" }}>No usage data yet</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Usage will appear once documents are processed.</p>
        </div>
      ) : null}
    </div>
  );
}
