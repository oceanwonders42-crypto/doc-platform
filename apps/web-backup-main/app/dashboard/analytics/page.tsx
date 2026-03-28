import Link from "next/link";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import HelpTooltip from "../../components/HelpTooltip";

export const dynamic = "force-dynamic";

type QualityAnalyticsResponse = {
  ok: boolean;
  totalDocs: number;
  processedDocs: number;
  autoRouteRate: number;
  unmatchedRate: number;
  duplicateRate: number;
  avgProcessingLatencyMs: number | null;
};

type MetricsSummaryResponse = {
  ok: boolean;
  trend?: { day: string; docsProcessed: number; recordsRequests: number }[];
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

function MetricCard({
  label,
  tooltip,
  value,
}: {
  label: string;
  tooltip?: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 14,
        fontFamily: "system-ui",
      }}
    >
      <div style={{ color: "#666", fontSize: 12, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {tooltip && <HelpTooltip text={tooltip} />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const [qualityData, metricsData] = await Promise.all([
    apiGet<QualityAnalyticsResponse>("/me/quality-analytics").catch(() => null),
    apiGet<MetricsSummaryResponse>("/me/metrics-summary").catch(() => null),
  ]);

  const trend = metricsData?.trend ?? [];
  const maxDocs = trend.length > 0 ? Math.max(1, ...trend.map((t) => t.docsProcessed)) : 1;

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 960,
        margin: "0 auto",
        fontFamily: "system-ui",
      }}
    >
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Analytics" }]} />
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Analytics</h1>

      {/* Metric cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="Documents processed"
          tooltip="Total documents successfully processed (OCR, extraction, routing)."
          value={qualityData?.processedDocs?.toLocaleString() ?? "—"}
        />
        <MetricCard
          label="Auto-route rate"
          tooltip="% of documents automatically routed to a case without manual review."
          value={qualityData?.ok ? `${qualityData.autoRouteRate}%` : "—"}
        />
        <MetricCard
          label="Unmatched rate"
          tooltip="% of documents that couldn't be matched to any case."
          value={qualityData?.ok ? `${qualityData.unmatchedRate}%` : "—"}
        />
        <MetricCard
          label="Duplicate rate"
          tooltip="% of documents detected as duplicates of existing files."
          value={qualityData?.ok ? `${qualityData.duplicateRate}%` : "—"}
        />
        <MetricCard
          label="Avg processing latency"
          tooltip="Average time from upload to processing complete."
          value={
            qualityData?.avgProcessingLatencyMs != null
              ? qualityData.avgProcessingLatencyMs < 1000
                ? `${Math.round(qualityData.avgProcessingLatencyMs)} ms`
                : `${(qualityData.avgProcessingLatencyMs / 1000).toFixed(2)} s`
              : "—"
          }
        />
      </section>

      {/* Documents processed per day chart */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Documents processed per day
        </h2>
        {trend.length > 0 ? (
          <div
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: 14,
              background: "#fafafa",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 4,
                height: 120,
                minHeight: 120,
              }}
            >
              {trend.slice(-30).map((t) => (
                <div
                  key={t.day}
                  title={`${t.day}: ${t.docsProcessed} docs`}
                  style={{
                    flex: 1,
                    minWidth: 8,
                    height: `${Math.max(8, (t.docsProcessed / maxDocs) * 100)}%`,
                    background: "#111",
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
                fontSize: 11,
                color: "#888",
              }}
            >
              <span>{trend[0]?.day ?? ""}</span>
              <span>{trend[trend.length - 1]?.day ?? ""}</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: 32,
              background: "#fafafa",
              color: "#666",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            No trend data available.
          </div>
        )}
      </section>
    </main>
  );
}
