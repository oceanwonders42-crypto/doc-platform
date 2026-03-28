"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type ErrorLogEntry = {
  id: string;
  service: string;
  message: string;
  stack: string | null;
  createdAt: string;
};

type AdminErrorsResponse = {
  ok: boolean;
  errors: ErrorLogEntry[];
  error?: string;
};

async function fetchErrors(service?: string): Promise<AdminErrorsResponse> {
  const qs = new URLSearchParams({ limit: "200" });
  if (service?.trim()) qs.set("service", service.trim());
  const res = await fetch(`/api/admin/errors?${qs}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, errors: [], error: data?.error || `HTTP ${res.status}` };
  return data as AdminErrorsResponse;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminErrorsPage() {
  const [data, setData] = useState<AdminErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceFilter, setServiceFilter] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<ErrorLogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchErrors(serviceFilter || undefined);
    setData(result);
    setLoading(false);
  }, [serviceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const errors = data?.errors ?? [];
  const distinctServices = [...new Set(errors.map((e) => e.service))].sort();

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
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>System errors</h1>
      </div>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Recent API and service errors logged centrally. Most recent first.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          Filter by service:
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              minWidth: 140,
            }}
          >
            <option value="">All</option>
            {distinctServices.map((s) => (
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

      {data?.error && <p style={{ color: "#c00", marginBottom: 12 }}>{data.error}</p>}

      {!data?.ok && !loading && <p style={{ color: "#c00" }}>Failed to load errors.</p>}

      {data?.ok && errors.length === 0 && <p style={{ color: "#666" }}>No errors logged yet.</p>}

      {data?.ok && errors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {errors.map((entry) => (
            <div
              key={entry.id}
              onClick={() => setSelectedEntry(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedEntry(entry)}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: "#eee",
                    color: "#333",
                  }}
                >
                  {entry.service}
                </span>
                <span style={{ fontSize: 12, color: "#888" }}>{formatDate(entry.createdAt)}</span>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  wordBreak: "break-word",
                  color: "#333",
                }}
              >
                {entry.message.length > 150 ? `${entry.message.slice(0, 150)}…` : entry.message}
              </div>
              {entry.stack && (
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>View stack trace →</div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedEntry && (
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
          onClick={() => setSelectedEntry(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="error-detail-title"
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
            <h2 id="error-detail-title" style={{ fontSize: 18, fontWeight: 600, margin: "0 0 16px 0" }}>
              Error details
            </h2>
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "#eee",
                  color: "#333",
                }}
              >
                {selectedEntry.service}
              </span>
              <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>
                {formatDate(selectedEntry.createdAt)}
              </span>
            </div>
            <div style={{ fontSize: 14, marginBottom: 16, wordBreak: "break-word" }}>
              {selectedEntry.message}
            </div>
            {selectedEntry.stack && (
              <pre
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "#555",
                  maxHeight: 300,
                  overflow: "auto",
                  border: "1px solid #eee",
                  borderRadius: 6,
                  padding: 12,
                  background: "#f9f9f9",
                }}
              >
                {selectedEntry.stack}
              </pre>
            )}
            <button
              type="button"
              onClick={() => setSelectedEntry(null)}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                fontSize: 14,
                border: "1px solid #333",
                borderRadius: 6,
                background: "#111",
                color: "#fff",
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
