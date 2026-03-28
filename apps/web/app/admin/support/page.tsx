"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, parseJsonResponse, getApiFetchInit } from "../../../lib/api";

type Health = {
  api: string;
  database: string;
  redis: string;
  documentPipelineDegraded?: boolean;
  recentErrorCount: number;
  recentFailedJobsCount: number;
  openErrorCount: number;
  recentOpenCriticalErrorsCount?: number;
  lastErrorAt: string | null;
  queueDepth: number;
  stuckProcessingCount?: number;
  rateLimitHitCount?: number;
  suspiciousUploadCount?: number;
  authFailureCount?: number;
  invalidPayloadCount?: number;
  supportBacklogCount?: number;
  workerStatus?: string;
  workerLastSeenAt?: string | null;
  workerStale?: boolean;
  timestamp: string;
};

type RecoverResult = {
  ok: boolean;
  count: number;
  documentIds: string[];
  dryRun: boolean;
  olderThanMinutes: number;
  limit: number;
  error?: string;
};

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = Date.now();
    const sec = Math.floor((now - d.getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  } catch {
    return iso;
  }
}

export default function AdminSupportPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverResult, setRecoverResult] = useState<RecoverResult | null>(null);
  const [recoverConfirm, setRecoverConfirm] = useState(false);

  const fetchHealth = () => {
    setLoading(true);
    setError(null);
    fetch(`${getApiBase()}/admin/system/health`, { headers: getAuthHeader() })
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as { ok?: boolean } & Health;
        if (d.ok) {
          const { ok: _o, ...rest } = d;
          setHealth(rest as Health);
        } else setError((d as { error?: string }).error || "Failed to load health");
      })
      .catch((e) => setError(e?.message || "Request failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const runRecover = (dryRun: boolean) => {
    setRecoverLoading(true);
    setRecoverResult(null);
    fetch(`${getApiBase()}/admin/system/recover-stuck-documents`, {
      ...getApiFetchInit({ method: "POST", body: JSON.stringify({ dryRun, olderThanMinutes: 15, limit: 100 }), headers: { "Content-Type": "application/json" } }),
    })
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as RecoverResult & { error?: string };
        if (d.ok !== false) setRecoverResult(d);
        else setRecoverResult({ ...d, ok: false, error: d.error || "Recovery failed" });
      })
      .catch((e) => setRecoverResult({ ok: false, count: 0, documentIds: [], dryRun, olderThanMinutes: 15, limit: 100, error: e?.message || "Request failed" }))
      .finally(() => {
        setRecoverLoading(false);
        setRecoverConfirm(false);
        fetchHealth();
      });
  };

  if (loading) return <p>Loading support dashboard…</p>;
  if (error) return <p style={{ color: "#b91c1c" }}>Error: {error}</p>;
  if (!health) return null;

  const degraded = health.documentPipelineDegraded === true;
  const workerStale = health.workerStale === true;
  const workerDown = health.workerStatus === "down" || health.workerStale;
  const stuckCount = health.stuckProcessingCount ?? 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Support dashboard</h1>
        <button type="button" onClick={fetchHealth} disabled={loading} style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}>Refresh</button>
      </div>

      {/* Worker / queue / pipeline section */}
      <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>Pipeline &amp; worker</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ padding: "1rem", background: degraded ? "#fef3c7" : "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Redis</div>
          <div style={{ fontWeight: 600 }}>{health.redis}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Queue depth</div>
          <div style={{ fontWeight: 600 }}>{health.queueDepth}</div>
        </div>
        <div style={{ padding: "1rem", background: workerDown ? "#fef3c7" : "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Worker status</div>
          <div style={{ fontWeight: 600 }}>{health.workerStatus ?? "unknown"}</div>
          {workerStale && <div style={{ fontSize: "0.75rem", color: "#b45309" }}>Stale</div>}
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Worker last seen</div>
          <div style={{ fontWeight: 600 }}>{formatRelativeTime(health.workerLastSeenAt)}</div>
          {health.workerLastSeenAt && <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{health.workerLastSeenAt}</div>}
        </div>
        <div style={{ padding: "1rem", background: degraded ? "#fef3c7" : "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Pipeline degraded</div>
          <div style={{ fontWeight: 600 }}>{degraded ? "Yes" : "No"}</div>
        </div>
        <div style={{ padding: "1rem", background: stuckCount > 0 ? "#fef3c7" : "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Stuck processing</div>
          <div style={{ fontWeight: 600 }}>{stuckCount}</div>
          {stuckCount > 0 && <div style={{ fontSize: "0.75rem", color: "#b45309" }}>Docs in PROCESSING &gt;15 min</div>}
        </div>
      </div>

      {/* Core services */}
      <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>Services</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>API</div>
          <div style={{ fontWeight: 600 }}>{health.api}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Database</div>
          <div style={{ fontWeight: 600 }}>{health.database}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Open errors</div>
          <div style={{ fontWeight: 600 }}>{health.openErrorCount}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Recent errors (24h)</div>
          <div style={{ fontWeight: 600 }}>{health.recentErrorCount}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Failed jobs (24h)</div>
          <div style={{ fontWeight: 600 }}>{health.recentFailedJobsCount}</div>
        </div>
      </div>

      <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Last error: {health.lastErrorAt ?? "—"}</p>

      {/* Stuck document recovery */}
      <h2 style={{ fontSize: "1.125rem", marginTop: "1.5rem", marginBottom: "0.5rem" }}>Stuck document recovery</h2>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.75rem" }}>
        Mark documents stuck in PROCESSING (older than 15 min) as FAILED so you can reprocess them. Dry-run shows what would be affected; execute applies the change.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={recoverLoading}
          onClick={() => runRecover(true)}
          style={{ padding: "0.5rem 0.75rem", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: recoverLoading ? "not-allowed" : "pointer" }}
        >
          {recoverLoading ? "…" : "Dry-run (preview)"}
        </button>
        {!recoverConfirm ? (
          <button
            type="button"
            disabled={recoverLoading || stuckCount === 0}
            onClick={() => setRecoverConfirm(true)}
            style={{ padding: "0.5rem 0.75rem", background: stuckCount === 0 ? "#e5e7eb" : "#fef2f2", border: `1px solid ${stuckCount === 0 ? "#d1d5db" : "#fecaca"}`, borderRadius: 6, cursor: stuckCount === 0 ? "not-allowed" : "pointer", color: stuckCount > 0 ? "#b91c1c" : undefined }}
          >
            Execute recovery
          </button>
        ) : (
          <>
            <span style={{ fontSize: "0.875rem", color: "#b91c1c" }}>Confirm: mark stuck as FAILED?</span>
            <button type="button" onClick={() => runRecover(false)} style={{ padding: "0.5rem 0.75rem", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Yes, execute</button>
            <button type="button" onClick={() => setRecoverConfirm(false)} style={{ padding: "0.5rem 0.75rem", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
          </>
        )}
      </div>
      {recoverResult && (
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f9fafb", borderRadius: 8, fontSize: "0.875rem" }}>
          {recoverResult.error ? <p style={{ color: "#b91c1c" }}>{recoverResult.error}</p> : null}
          <p><strong>{recoverResult.dryRun ? "Dry-run" : "Executed"}:</strong> {recoverResult.count} document(s).</p>
          {recoverResult.documentIds.length > 0 && <p style={{ wordBreak: "break-all" }}>IDs: {recoverResult.documentIds.slice(0, 5).join(", ")}{recoverResult.documentIds.length > 5 ? ` … +${recoverResult.documentIds.length - 5} more` : ""}</p>}
        </div>
      )}

      <ul style={{ marginTop: "1.5rem" }}>
        <li><Link href="/admin/errors">View system errors</Link></li>
        <li><Link href="/admin/support/bug-reports">View bug reports</Link></li>
      </ul>
    </div>
  );
}
