"use client";

import { useEffect, useState } from "react";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";

type Analytics = {
  docsByStatus: Record<string, number>;
  totalDocs: number;
  processedDocs: number;
  autoRouteRate: number;
  unmatchedRate: number;
  duplicateRate: number;
  avgLatencyMs: number | null;
  topFailureReasons: Array<{ reason: string; count: number }>;
  perFirmData?: Array<{
    firmId: string;
    firmName: string;
    totalDocs: number;
    processedDocs: number;
    autoRouteRate: number;
    unmatchedRate: number;
    duplicateRate: number;
    avgProcessingLatencyMs: number | null;
    failedDocs: number;
    needsReviewDocs: number;
  }>;
};

export default function AdminQualityPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firmId, setFirmId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (firmId.trim()) params.set("firmId", firmId.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    fetch(`${getApiBase()}/admin/quality/analytics?${params}`, { headers: getAuthHeader() })
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as { ok?: boolean; docsByStatus?: Record<string, number>; totalDocs?: number; processedDocs?: number; autoRouteRate?: number; unmatchedRate?: number; duplicateRate?: number; avgProcessingLatencyMs?: number | null; topFailureReasons?: Array<{ reason: string; count: number }>; perFirmBreakdown?: Analytics["perFirmData"] };
        if (d.ok) {
          setAnalytics({
            docsByStatus: d.docsByStatus ?? {},
            totalDocs: d.totalDocs ?? 0,
            processedDocs: d.processedDocs ?? 0,
            autoRouteRate: d.autoRouteRate ?? 0,
            unmatchedRate: d.unmatchedRate ?? 0,
            duplicateRate: d.duplicateRate ?? 0,
            avgLatencyMs: d.avgProcessingLatencyMs ?? null,
            topFailureReasons: d.topFailureReasons ?? [],
            perFirmData: d.perFirmBreakdown,
          });
        } else setError((d as { error?: string }).error ?? "Failed to load");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [firmId, dateFrom, dateTo]);

  if (error) {
    return (
      <div style={{ padding: "1rem" }}>
        <h1 className="onyx-heading-2" style={{ marginBottom: "1rem" }}>Quality analytics</h1>
        <p style={{ color: "var(--onyx-error)" }}>{error}</p>
      </div>
    );
  }

  const statusOrder = ["RECEIVED", "PROCESSING", "SCANNED", "CLASSIFIED", "ROUTED", "NEEDS_REVIEW", "UPLOADED", "UNMATCHED", "FAILED"];

  return (
    <div style={{ padding: "1rem" }}>
      <h1 className="onyx-heading-2" style={{ marginBottom: "1rem" }}>Quality analytics</h1>
      <p style={{ color: "var(--onyx-text-muted)", marginBottom: "1rem", fontSize: "0.875rem" }}>
        Pipeline health: docs by status, auto-route rate, unmatched rate, duplicate rate, avg processing latency, top failure reasons.
      </p>

      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Firm ID"
          value={firmId}
          onChange={(e) => setFirmId(e.target.value)}
          className="onyx-input"
          style={{ width: 160 }}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="onyx-input"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="onyx-input"
        />
        <button type="button" onClick={load} disabled={loading} className="onyx-button onyx-button-primary">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && !analytics ? (
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
      ) : analytics ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="onyx-card" style={{ padding: "1rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Docs by status</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {statusOrder.map((s) => {
                const count = analytics.docsByStatus[s] ?? 0;
                return (
                  <span key={s} className="onyx-badge onyx-badge-neutral" style={{ marginRight: "0.25rem" }}>
                    {s}: {count}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Total docs</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{analytics.totalDocs}</div>
            </div>
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Auto-route rate</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{analytics.autoRouteRate.toFixed(1)}%</div>
            </div>
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Unmatched rate</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{analytics.unmatchedRate.toFixed(1)}%</div>
            </div>
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Duplicate rate</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{analytics.duplicateRate.toFixed(1)}%</div>
            </div>
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Avg latency</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                {analytics.avgLatencyMs != null ? `${Math.round(analytics.avgLatencyMs)} ms` : "—"}
              </div>
            </div>
          </div>

          {analytics.topFailureReasons.length > 0 && (
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Top failure reasons</h2>
              <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                {analytics.topFailureReasons.map((r, i) => (
                  <li key={i} style={{ marginBottom: "0.25rem" }}>
                    <span className="onyx-badge onyx-badge-error" style={{ marginRight: "0.5rem" }}>{r.count}</span>
                    {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analytics.perFirmData && analytics.perFirmData.length > 0 && (
            <div className="onyx-card" style={{ padding: "1rem", overflowX: "auto" }}>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Per firm</h2>
              <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem" }}>Firm</th>
                    <th style={{ textAlign: "right", padding: "0.5rem" }}>Total</th>
                    <th style={{ textAlign: "right", padding: "0.5rem" }}>Auto-route %</th>
                    <th style={{ textAlign: "right", padding: "0.5rem" }}>Unmatched %</th>
                    <th style={{ textAlign: "right", padding: "0.5rem" }}>Dup %</th>
                    <th style={{ textAlign: "right", padding: "0.5rem" }}>Failed</th>
                    <th style={{ textAlign: "right", padding: "0.5rem" }}>Latency (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.perFirmData.map((f) => (
                    <tr key={f.firmId} style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                      <td style={{ padding: "0.5rem" }}>{f.firmName}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{f.totalDocs}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{f.autoRouteRate.toFixed(1)}%</td>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{f.unmatchedRate.toFixed(1)}%</td>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{f.duplicateRate.toFixed(1)}%</td>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{f.failedDocs}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{f.avgProcessingLatencyMs != null ? String(f.avgProcessingLatencyMs) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
