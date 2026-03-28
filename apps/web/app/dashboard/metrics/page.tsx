import Link from "next/link";

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
  const [metricsData, reviewData] = await Promise.all([
    apiGet<MetricsSummaryResponse>("/me/metrics-summary").catch(() => null),
    apiGet<ReviewMetricsResponse>("/metrics/review?range=7d").catch(() => null),
  ]);

  const summary = metricsData?.summary;
  const trend = metricsData?.trend ?? [];
  const reviewSummary = reviewData?.summary;
  const perDay = reviewData?.perDay ?? [];
  const today = perDay[perDay.length - 1];

  const maxDocs = trend.length > 0 ? Math.max(1, ...trend.map((t) => t.docsProcessed)) : 1;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
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
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Docs this month</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.docsProcessedThisMonth}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Pages this month</div>
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
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Unmatched docs</div>
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
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Needs review</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.needsReviewDocs}</div>
            </div>
          </Link>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Records requests (month)</div>
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
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Unread notifications</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.notificationsUnread}</div>
            </div>
          </Link>
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
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Docs ingested</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{reviewSummary.totalIngested}</div>
            {today && (
              <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>Today: {today.ingested}</div>
            )}
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Docs routed</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{reviewSummary.totalRouted}</div>
            {today && (
              <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>Today: {today.routed}</div>
            )}
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Median time to route</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {reviewSummary.medianMinutes != null
                ? `${reviewSummary.medianMinutes.toFixed(1)} min`
                : "—"}
            </div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Current queue size</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{reviewSummary.currentQueueSize}</div>
          </div>
        </section>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>Daily stats</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "6px 8px" }}>Day</th>
                <th style={{ padding: "6px 8px" }}>Ingested</th>
                <th style={{ padding: "6px 8px" }}>Routed</th>
                <th style={{ padding: "6px 8px" }}>Queue size (EOD)</th>
              </tr>
            </thead>
            <tbody>
              {perDay.map((d) => (
                <tr key={d.day} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "6px 8px" }}>{d.day}</td>
                  <td style={{ padding: "6px 8px" }}>{d.ingested}</td>
                  <td style={{ padding: "6px 8px" }}>{d.routed}</td>
                  <td style={{ padding: "6px 8px" }}>{d.queueSize}</td>
                </tr>
              ))}
              {perDay.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "8px 8px", color: "#666" }}>
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>Top facilities</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "6px 8px" }}>Facility</th>
                  <th style={{ padding: "6px 8px" }}>Docs</th>
                </tr>
              </thead>
              <tbody>
                {reviewSummary?.topFacilities.map((f) => (
                  <tr key={f.facility} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "6px 8px" }}>{f.facility}</td>
                    <td style={{ padding: "6px 8px" }}>{f.count}</td>
                  </tr>
                ))}
                {(!reviewSummary || reviewSummary.topFacilities.length === 0) && (
                  <tr>
                    <td colSpan={2} style={{ padding: "6px 8px", color: "#666" }}>
                      No data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>Top providers</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "6px 8px" }}>Provider</th>
                  <th style={{ padding: "6px 8px" }}>Docs</th>
                </tr>
              </thead>
              <tbody>
                {reviewSummary?.topProviders.map((p) => (
                  <tr key={p.provider} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "6px 8px" }}>{p.provider}</td>
                    <td style={{ padding: "6px 8px" }}>{p.count}</td>
                  </tr>
                ))}
                {(!reviewSummary || reviewSummary.topProviders.length === 0) && (
                  <tr>
                    <td colSpan={2} style={{ padding: "6px 8px", color: "#666" }}>
                      No data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
