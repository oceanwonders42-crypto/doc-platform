"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Job = {
  id: string;
  firmId: string;
  type: string;
  payload: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  runAt: string;
  createdAt: string;
  updatedAt: string;
  firm: { name: string };
};

type AdminJobsResponse = {
  ok: boolean;
  items: Job[];
  error?: string;
};

async function fetchJobs(status?: string): Promise<AdminJobsResponse> {
  const qs = new URLSearchParams({ limit: "100" });
  if (status?.trim()) qs.set("status", status.trim());
  const res = await fetch(`/api/admin/jobs?${qs}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, items: [], error: data?.error || `HTTP ${res.status}` };
  return data as AdminJobsResponse;
}

async function retryJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/jobs/${encodeURIComponent(id)}/retry`, {
    method: "POST",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
  return { ok: true };
}

import { formatTimestamp } from "../../lib/formatTimestamp";
import { getStatusColors } from "../../lib/statusColors";

function statusColor(s: string): string {
  switch (s) {
    case "done":
      return getStatusColors("success").text;
    case "running":
      return getStatusColors("processing").text;
    case "failed":
      return getStatusColors("error").text;
    default:
      return "#666";
  }
}

export default function AdminJobsPage() {
  const [data, setData] = useState<AdminJobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJobs(statusFilter || undefined);
    setData(result);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    const result = await retryJob(id);
    if (result.ok) await load();
    else alert(result.error || "Retry failed");
    setRetrying(null);
  };

  const jobs = data?.items ?? [];
  const distinctStatuses = [...new Set(jobs.map((j) => j.status))].sort();

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1000,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Admin
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Background jobs</h1>
      </div>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        DB-backed jobs with retries and exponential backoff. Failed jobs can be retried.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          Filter by status:
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              minWidth: 120,
            }}
          >
            <option value="">All</option>
            {distinctStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            border: "1px solid #333",
            borderRadius: 6,
            background: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {data?.error && <p style={{ color: "var(--status-error-text)", marginBottom: 12 }}>{data.error}</p>}

      {!data?.ok && !loading && <p style={{ color: "var(--status-error-text)" }}>Failed to load jobs.</p>}

      {data?.ok && jobs.length === 0 && <p style={{ color: "#666" }}>No jobs yet.</p>}

      {data?.ok && jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => setSelectedJob(job)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedJob(job)}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{job.type}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: "#eee",
                    color: statusColor(job.status),
                  }}
                >
                  {job.status}
                </span>
                <span style={{ fontSize: 12, color: "#888" }}>{job.firm?.name ?? job.firmId}</span>
                <span style={{ fontSize: 12, color: "#888" }}>{formatTimestamp(job.createdAt)}</span>
                {job.attempts > 0 && (
                  <span style={{ fontSize: 11, color: "#666" }}>{job.attempts} attempts</span>
                )}
                {job.status === "failed" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetry(job.id);
                    }}
                    disabled={retrying === job.id}
                    style={{
                      marginLeft: "auto",
                      padding: "4px 10px",
                      fontSize: 12,
                      border: "1px solid #333",
                      borderRadius: 6,
                      background: "#fff",
                      cursor: retrying === job.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {retrying === job.id ? "Retrying…" : "Retry"}
                  </button>
                )}
              </div>
              {(job.payload || job.lastError) && (
                <div style={{ fontSize: 12, color: "#666" }}>
                  {job.lastError
                    ? `${job.lastError.slice(0, 80)}…`
                    : typeof job.payload === "object"
                      ? JSON.stringify(job.payload).slice(0, 80) + "…"
                      : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedJob && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
          onClick={() => setSelectedJob(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-detail-title"
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 640,
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="job-detail-title" style={{ fontSize: 18, fontWeight: 600, margin: "0 0 16px 0" }}>
              Job details
            </h2>
            <div style={{ marginBottom: 12, fontSize: 14 }}>
              <strong>Type:</strong> {selectedJob.type} · <strong>Status:</strong>{" "}
              <span style={{ color: statusColor(selectedJob.status) }}>{selectedJob.status}</span> ·{" "}
              <strong>Attempts:</strong> {selectedJob.attempts}
            </div>
            <div style={{ marginBottom: 12, fontSize: 14 }}>
              <strong>Firm:</strong> {selectedJob.firm?.name ?? selectedJob.firmId} ·{" "}
              <strong>Created:</strong> {formatTimestamp(selectedJob.createdAt)} ·{" "}
              <strong>Run at:</strong> {formatTimestamp(selectedJob.runAt)}
            </div>
            {selectedJob.payload != null && (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 14 }}>Payload</strong>
                <pre
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 12,
                    fontFamily: "ui-monospace, monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "#555",
                    maxHeight: 200,
                    overflow: "auto",
                    border: "1px solid #eee",
                    borderRadius: 6,
                    padding: 12,
                    background: "#f9f9f9",
                  }}
                >
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>
            )}
            {selectedJob.lastError && (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 14, color: "var(--status-error-text)" }}>Last error</strong>
                <pre
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 12,
                    fontFamily: "ui-monospace, monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "var(--status-error-text)",
                    maxHeight: 200,
                    overflow: "auto",
                    border: "1px solid var(--status-error-text)",
                    borderRadius: 6,
                    padding: 12,
                    background: "var(--status-error-bg)",
                  }}
                >
                  {selectedJob.lastError}
                </pre>
              </div>
            )}
            {selectedJob.status === "failed" && (
              <button
                type="button"
                onClick={() => handleRetry(selectedJob.id)}
                disabled={retrying === selectedJob.id}
                style={{
                  marginRight: 8,
                  padding: "8px 16px",
                  fontSize: 14,
                  border: "1px solid #333",
                  borderRadius: 6,
                  background: "#111",
                  color: "#fff",
                  cursor: retrying === selectedJob.id ? "not-allowed" : "pointer",
                }}
              >
                {retrying === selectedJob.id ? "Retrying…" : "Retry"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedJob(null)}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                border: "1px solid #333",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
