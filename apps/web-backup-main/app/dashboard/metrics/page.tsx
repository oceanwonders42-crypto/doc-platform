import Link from "next/link";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import HelpTooltip from "../../components/HelpTooltip";

type MetricsSummaryResponse = {
  ok: boolean;
  summary: {
    docsProcessedThisMonth: number;
    pagesProcessedThisMonth: number;
    unmatchedDocs: number;
    needsReviewDocs: number;
    recordsRequestsCreatedThisMonth: number;
    notificationsUnread: number;
  };
  trend?: { day: string; docsProcessed: number; recordsRequests: number }[];
};

type QualityAnalyticsResponse = {
  ok: boolean;
  totalDocs: number;
  processedDocs: number;
  autoRouteRate: number;
  unmatchedRate: number;
  duplicateRate: number;
  avgProcessingLatencyMs: number | null;
};

type ReviewMetricsResponse = {
  ok: boolean;
  rangeDays: number;
  summary: {
    totalIngested: number;
    totalRouted: number;
    medianSeconds: number | null;
    medianMinutes: number | null;
    currentQueueSize: number;
    topFacilities: { facility: string; count: number }[];
    topProviders: { provider: string; count: number }[];
  };
  perDay: { day: string; ingested: number; routed: number; queueSize: number }[];
};

async function apiGet<T>(path: string): Promise<T> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;

  if (!base) throw new Error("Missing DOC_API_URL in apps/web/.env.local");
  if (!key) throw new Error("Missing DOC_API_KEY in apps/web/.env.local");

  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

export default async function MetricsPage() {
  const [metricsData, reviewData, qualityData] = await Promise.all([
    apiGet<MetricsSummaryResponse>("/me/metrics-summary").catch(() => null),
    apiGet<ReviewMetricsResponse>("/metrics/review?range=7d").catch(() => null),
    apiGet<QualityAnalyticsResponse>("/me/quality-analytics").catch(() => null),
  ]);

  const summary = metricsData?.summary;
  const trend = metricsData?.trend ?? [];
  const reviewSummary = reviewData?.summary;
  const perDay = reviewData?.perDay ?? [];
  const today = perDay[perDay.length - 1];

  const maxDocs = trend.length > 0 ? Math.max(1, ...trend.map((t) => t.docsProcessed)) : 1;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Metrics" }]} />
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Dashboard Metrics</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Overview of documents, records requests, and notifications.
      </p>

      {/* Global counters */}
      {summary && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Docs this month <HelpTooltip text="Documents (files) processed this billing month." />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.docsProcessedThisMonth}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Pages this month <HelpTooltip text="PDF pages processed this month. Used for billing." />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.pagesProcessedThisMonth}</div>
          </div>
          <Link href="/dashboard/review" style={{ textDecoration: "none", color: "inherit" }}>
            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 14,
                background: summary.unmatchedDocs > 0 ? "#fef3c7" : undefined,
                cursor: "pointer",
              }}
            >
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Unmatched docs <HelpTooltip text="Documents that couldn't be matched to a case. Review and route manually." />
            </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.unmatchedDocs}</div>
            </div>
          </Link>
          <Link href="/dashboard/review" style={{ textDecoration: "none", color: "inherit" }}>
            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 14,
                background: summary.needsReviewDocs > 0 ? "#fef3c7" : undefined,
                cursor: "pointer",
              }}
            >
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Needs review <HelpTooltip text="Documents in the review queue awaiting manual routing or approval." />
            </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.needsReviewDocs}</div>
            </div>
          </Link>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Records requests (month) <HelpTooltip text="Medical records requests created this month." />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.recordsRequestsCreatedThisMonth}</div>
          </div>
          <Link href="/notifications" style={{ textDecoration: "none", color: "inherit" }}>
            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 14,
                background: summary.notificationsUnread > 0 ? "#dbeafe" : undefined,
                cursor: "pointer",
              }}
            >
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Unread notifications <HelpTooltip text="Notifications you haven't read yet. Click to view." />
            </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.notificationsUnread}</div>
            </div>
          </Link>
        </section>
      )}

      {/* Quality metrics (from /me/quality-analytics) */}
      {qualityData?.ok && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Quality Metrics</h2>
          <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
            Document processing quality from admin quality analytics.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                Total documents processed <HelpTooltip text="All documents successfully processed (OCR, extraction, routing)." />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{qualityData.totalDocs.toLocaleString()}</div>
            </div>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                Auto-route rate <HelpTooltip text="% of documents automatically routed without manual review." />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{qualityData.autoRouteRate}%</div>
            </div>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                Unmatched rate <HelpTooltip text="% of documents that couldn't be matched to any case." />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{qualityData.unmatchedRate}%</div>
            </div>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                Duplicate rate <HelpTooltip text="% of documents detected as duplicates of existing files." />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{qualityData.duplicateRate}%</div>
            </div>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                Avg processing latency <HelpTooltip text="Average time from upload to processing complete." />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {qualityData.avgProcessingLatencyMs != null
                  ? qualityData.avgProcessingLatencyMs < 1000
                    ? `${Math.round(qualityData.avgProcessingLatencyMs)} ms`
                    : `${(qualityData.avgProcessingLatencyMs / 1000).toFixed(2)} s`
                  : "—"}
              </div>
            </div>
          </div>
        </section>
      )}


      {/* 30-day trend sparkline */}
      {trend.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>30-day trend (docs processed)</h2>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 2,
              height: 60,
              padding: "8px 0",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              background: "#fafafa",
            }}
          >
            {trend.slice(-30).map((t) => (
              <div
                key={t.day}
                title={`${t.day}: ${t.docsProcessed} docs`}
                style={{
                  flex: 1,
                  minWidth: 4,
                  height: `${Math.max(4, (t.docsProcessed / maxDocs) * 100)}%`,
                  background: "#111",
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Review queue performance */}
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Review Queue Performance</h2>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Last {reviewData?.rangeDays ?? 7} days of ingestion, routing, and queue metrics.
      </p>

      {reviewSummary && (
        <section
          className="review-metrics-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Docs ingested <HelpTooltip text="Documents received (upload, email) in the last 7 days." />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{reviewSummary.totalIngested}</div>
            {today && (
              <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>Today: {today.ingested}</div>
            )}
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Docs routed <HelpTooltip text="Documents routed to a case (auto or manual) in the last 7 days." />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{reviewSummary.totalRouted}</div>
            {today && (
              <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>Today: {today.routed}</div>
            )}
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Median time to route <HelpTooltip text="Median time from ingest to routing (auto or manual)." />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {reviewSummary.medianMinutes != null
                ? `${reviewSummary.medianMinutes.toFixed(1)} min`
                : "—"}
            </div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Current queue size <HelpTooltip text="Documents awaiting review or routing right now." />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{reviewSummary.currentQueueSize}</div>
          </div>
        </section>
      )}

      <section className="metrics-grid-responsive" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>Daily stats</h2>
          <div className="table-scroll-wrapper">
            <table className="dashboard-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Day</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Ingested</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Routed</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Queue size (EOD)</th>
              </tr>
            </thead>
            <tbody>
              {perDay.map((d) => (
                <tr key={d.day} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "12px 16px" }}>{d.day}</td>
                  <td style={{ padding: "12px 16px" }}>{d.ingested}</td>
                  <td style={{ padding: "12px 16px" }}>{d.routed}</td>
                  <td style={{ padding: "12px 16px" }}>{d.queueSize}</td>
                </tr>
              ))}
              {perDay.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "12px 16px", color: "#666" }}>
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>Top facilities</h2>
            <div className="table-scroll-wrapper">
              <table className="dashboard-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Facility</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Docs</th>
                </tr>
              </thead>
              <tbody>
                {reviewSummary?.topFacilities.map((f) => (
                  <tr key={f.facility} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "12px 16px" }}>{f.facility}</td>
                    <td style={{ padding: "12px 16px" }}>{f.count}</td>
                  </tr>
                ))}
                {(!reviewSummary || reviewSummary.topFacilities.length === 0) && (
                  <tr>
                    <td colSpan={2} style={{ padding: "12px 16px", color: "#666" }}>
                      No data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>Top providers</h2>
            <div className="table-scroll-wrapper">
              <table className="dashboard-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Provider</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Docs</th>
                </tr>
              </thead>
              <tbody>
                {reviewSummary?.topProviders.map((p) => (
                  <tr key={p.provider} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "12px 16px" }}>{p.provider}</td>
                    <td style={{ padding: "12px 16px" }}>{p.count}</td>
                  </tr>
                ))}
                {(!reviewSummary || reviewSummary.topProviders.length === 0) && (
                  <tr>
                    <td colSpan={2} style={{ padding: "12px 16px", color: "#666" }}>
                      No data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
