import Link from "next/link";
import { Suspense } from "react";
import QualityFilters from "./QualityFilters";
import PerFirmTable from "./PerFirmTable";

type FirmRow = {
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
};

type AnalyticsResponse = {
  ok: boolean;
  docsByStatus: Record<string, number>;
  autoRouteRate: number;
  unmatchedRate: number;
  duplicateRate: number;
  avgProcessingLatencyMs: number | null;
  totalDocs: number;
  processedDocs: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
  usageStats: { docsProcessed: number; duplicateDetected: number };
  perFirmBreakdown?: FirmRow[];
  firms?: Array<{ id: string; name: string }>;
  timeSeries?: Array<{ period: string; totalDocs: number; processedDocs: number; autoRouteRate: number; unmatchedRate: number }>;
  dateFrom?: string | null;
  dateTo?: string | null;
  error?: string;
};

async function fetchAnalytics(params: {
  firmId?: string;
  dateFrom?: string;
  dateTo?: string;
  groupBy?: string;
}): Promise<AnalyticsResponse> {
  const base = process.env.DOC_API_URL;
  const key = process.env.PLATFORM_ADMIN_API_KEY;
  if (!base || !key) {
    return {
      ok: false,
      error: "DOC_API_URL or PLATFORM_ADMIN_API_KEY not set",
      docsByStatus: {},
      autoRouteRate: 0,
      unmatchedRate: 0,
      duplicateRate: 0,
      avgProcessingLatencyMs: null,
      totalDocs: 0,
      processedDocs: 0,
      topFailureReasons: [],
      usageStats: { docsProcessed: 0, duplicateDetected: 0 },
    };
  }
  const qs = new URLSearchParams();
  if (params.firmId?.trim()) qs.set("firmId", params.firmId.trim());
  if (params.dateFrom?.trim()) qs.set("dateFrom", params.dateFrom.trim());
  if (params.dateTo?.trim()) qs.set("dateTo", params.dateTo.trim());
  if (params.groupBy?.trim()) qs.set("groupBy", params.groupBy.trim());
  const query = qs.toString();
  const res = await fetch(`${base}/admin/quality/analytics${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as AnalyticsResponse;
  if (!res.ok)
    return {
      ...data,
      ok: false,
      docsByStatus: {},
      topFailureReasons: [],
      usageStats: { docsProcessed: 0, duplicateDetected: 0 },
    };
  return data;
}

function formatLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default async function AdminQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ firmId?: string; dateFrom?: string; dateTo?: string; groupBy?: string }>;
}) {
  const params = await searchParams;
  let data: AnalyticsResponse;
  try {
    data = await fetchAnalytics({
      firmId: params.firmId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      groupBy: params.groupBy,
    });
  } catch (e) {
    return (
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            ← Admin
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Quality control</h1>
        </div>
        <p style={{ color: "#c00" }}>{e instanceof Error ? e.message : String(e)}</p>
      </main>
    );
  }

  if (!data.ok || data.error) {
    return (
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            ← Admin
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Quality control</h1>
        </div>
        <p style={{ color: "#c00" }}>{data.error ?? "Failed to load analytics"}</p>
      </main>
    );
  }

  const {
    docsByStatus,
    autoRouteRate,
    unmatchedRate,
    duplicateRate,
    avgProcessingLatencyMs,
    totalDocs,
    processedDocs,
    topFailureReasons,
    usageStats,
    perFirmBreakdown = [],
    firms = [],
    timeSeries,
    dateFrom,
    dateTo,
  } = data;

  const statusLabels: Record<string, string> = {
    RECEIVED: "Received",
    PROCESSING: "Processing",
    NEEDS_REVIEW: "Needs review",
    UPLOADED: "Uploaded (auto-routed)",
    FAILED: "Failed",
    UNMATCHED: "Unmatched",
  };

  const dateRangeNote =
    dateFrom || dateTo ? ` (${dateFrom ?? "…"} – ${dateTo ?? "…"})` : "";

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Admin
        </Link>
        <Link href="/admin/dashboard" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          Dashboard
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Quality control</h1>
      </div>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Platform health and quality metrics. Use this to see if processing is healthy and improving.
      </p>

      <Suspense fallback={<div style={{ padding: 16, color: "#666" }}>Loading filters…</div>}>
        <QualityFilters firms={firms} />
      </Suspense>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Total documents{dateRangeNote}</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{totalDocs.toLocaleString()}</div>
        </div>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Auto-route rate</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{autoRouteRate}%</div>
          <div style={{ fontSize: 12, color: "#888" }}>of {processedDocs.toLocaleString()} processed</div>
        </div>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Unmatched rate</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{unmatchedRate}%</div>
        </div>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Duplicate rate</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{duplicateRate}%</div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {usageStats.duplicateDetected.toLocaleString()} of {usageStats.docsProcessed.toLocaleString()} docs
          </div>
        </div>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Avg processing latency</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{formatLatency(avgProcessingLatencyMs)}</div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Documents by status</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(docsByStatus).map(([status, count]) => (
            <div
              key={status}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                padding: "10px 14px",
                minWidth: 160,
                background: status === "FAILED" || status === "UNMATCHED" ? "#fff8f8" : "#fafafa",
              }}
            >
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{statusLabels[status] ?? status}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{count.toLocaleString()}</div>
            </div>
          ))}
        </div>
        {totalDocs === 0 && <p style={{ color: "#666", margin: 0 }}>No documents yet.</p>}
      </section>

      <Suspense fallback={<div style={{ padding: 16, color: "#666" }}>Loading table…</div>}>
        <PerFirmTable
          rows={perFirmBreakdown}
          selectedFirmId={params.firmId ?? null}
        />
      </Suspense>

      {timeSeries && timeSeries.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Time series</h2>
          <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f5f5f5", textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "10px 8px" }}>Period</th>
                  <th style={{ padding: "10px 8px" }}>Total docs</th>
                  <th style={{ padding: "10px 8px" }}>Processed</th>
                  <th style={{ padding: "10px 8px" }}>Auto-route %</th>
                  <th style={{ padding: "10px 8px" }}>Unmatched %</th>
                </tr>
              </thead>
              <tbody>
                {timeSeries.map((r) => (
                  <tr key={r.period} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "8px" }}>{r.period}</td>
                    <td style={{ padding: "8px" }}>{r.totalDocs.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{r.processedDocs.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{r.autoRouteRate}%</td>
                    <td style={{ padding: "8px" }}>{r.unmatchedRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Top failure reasons</h2>
        {topFailureReasons.length === 0 ? (
          <p style={{ color: "#666", margin: 0 }}>No errors logged recently.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topFailureReasons.map(({ reason, count }, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: 12,
                  background: "#fff8f8",
                  fontSize: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ wordBreak: "break-word", flex: 1 }}>{reason}</span>
                  <span style={{ fontWeight: 600, color: "#b71c1c", flexShrink: 0 }}>{count}×</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
          From last 500 SystemErrorLog entries.{" "}
          <Link href="/admin/errors" style={{ color: "#1565c0", textDecoration: "underline" }}>
            View full error log →
          </Link>
        </p>
      </section>
    </main>
  );
}
