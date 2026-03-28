import type { Metadata } from "next";
import AutoRefresh from "./AutoRefresh";
import DocumentsSection from "./DocumentsSection";
import DemoDataButton from "./DemoDataButton";
import Link from "next/link";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageHeader } from "../components/PageHeader";
import HelpTooltip from "../components/HelpTooltip";
import { formatTimestamp, formatDate } from "../lib/formatTimestamp";

export const metadata: Metadata = { title: "Dashboard" };

type NeedsAttentionResponse = {
  ok: boolean;
  unmatchedDocuments: { count: number; items: { id: string; originalName: string; createdAt: string }[] };
  failedDocuments: { count: number; items: { id: string; originalName: string; createdAt: string }[] };
  overdueCaseTasks: { count: number; items: { id: string; title: string; dueDate: string | null; caseId: string }[] };
  recordsRequestsNeedingFollowUp: {
    count: number;
    items: { id: string; providerName: string; caseId: string; status: string; createdAt: string }[];
  };
  systemErrors: { count: number; items: { id: string; service: string; message: string; createdAt: string }[] };
};

type RecentActivityResponse = {
  ok?: boolean;
  items?: { type: string; id: string; label: string; href: string; createdAt: string }[];
};

type UsageResponse = {
  ok: boolean;
  firm: {
    id: string;
    name: string;
    plan: string;
    pageLimitMonthly: number;
    status: string;
  };
  usage: {
    yearMonth?: string;
    pagesProcessed: number;
    docsProcessed: number;
    insuranceDocsExtracted?: number;
    courtDocsExtracted?: number;
    narrativeGenerated?: number;
    duplicateDetected?: number;
    updatedAt?: string;
  };
};

function NeedsAttentionCard({
  title,
  tooltip,
  count,
  href,
  items,
}: {
  title: string;
  tooltip?: string;
  count: number;
  href: string;
  items: { href: string; label: string; sub: string }[];
}) {
  if (count === 0 && items.length === 0) return null;
  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, background: count > 0 ? "var(--status-warning-bg)" : "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          {tooltip && <HelpTooltip text={tooltip} />}
        </span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{count}</span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
        {items.map((item, i) => (
          <li key={`${item.href}-${item.label}-${i}`} style={{ marginBottom: 6 }}>
            <Link
              href={item.href}
              style={{ color: "#06c", textDecoration: "underline" }}
            >
              {item.label}
            </Link>
            <div style={{ color: "#666", fontSize: 12 }}>{item.sub}</div>
          </li>
        ))}
      </ul>
      {count > 0 && href !== "#" && (
        <Link
          href={href}
          style={{
            display: "block",
            marginTop: 10,
            fontSize: 12,
            color: "#06c",
            textDecoration: "underline",
          }}
        >
          View all →
        </Link>
      )}
    </div>
  );
}

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

export default async function DashboardPage() {
  const [usage, needsData, activityData] = await Promise.all([
    apiGet<UsageResponse>("/me/usage"),
    apiGet<NeedsAttentionResponse>("/me/needs-attention").catch(() => null),
    apiGet<RecentActivityResponse>("/me/recent-activity").catch(() => null),
  ]);

  const percent =
    usage.firm.pageLimitMonthly > 0
      ? Math.round((usage.usage.pagesProcessed / usage.firm.pageLimitMonthly) * 100)
      : 0;

  const isProd = process.env.NODE_ENV === "production";
  const demoMode = process.env.DEMO_MODE === "true";
  const showDemoButton = !isProd || demoMode;
  const showDevBanner = !isProd || demoMode;
  const apiKey = process.env.DOC_API_KEY?.trim() || "";
  const apiKeyStatus = apiKey
    ? `DOC_API_KEY: set (prefix: ${apiKey.slice(0, 10)}...)`
    : "DOC_API_KEY: missing";

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <Breadcrumbs items={[{ label: "Dashboard" }]} />
      {showDevBanner && (
        <div
          style={{
            fontSize: 12,
            color: "#666",
            background: "#f5f5f5",
            padding: "6px 10px",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {apiKeyStatus}
        </div>
      )}
      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          background: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Doc Platform</h1>
        <p style={{ color: "#555", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Document processing and case management for your firm.
        </p>
      </div>
      <PageHeader
        title="Dashboard"
        description="Overview of usage, recent activity, and items needing attention."
        actions={<DemoDataButton show={showDemoButton} />}
      />
      <AutoRefresh intervalMs={3000} />
      <div style={{ color: "#555", marginBottom: 20 }}>
        Firm: <b>{usage.firm.name}</b> · Plan: <b>{usage.firm.plan}</b> · Status: <b>{usage.firm.status}</b>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 22 }}>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            Month <HelpTooltip text="Billing period for usage (YYYY-MM)." />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{usage.usage.yearMonth}</div>
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            Pages processed <HelpTooltip text="Total PDF pages processed this month vs your plan limit. Used for billing." />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {usage.usage.pagesProcessed} / {usage.firm.pageLimitMonthly} ({percent}%)
          </div>
          <div style={{ height: 8, background: "#f1f1f1", borderRadius: 999, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(percent, 100)}%`, height: "100%", background: "#111" }} />
          </div>
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            Docs processed <HelpTooltip text="Number of documents (files) processed this month." />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{usage.usage.docsProcessed}</div>
          {usage.usage.updatedAt ? (
            <div style={{ color: "#666", fontSize: 12, marginTop: 8 }}>Updated: {formatTimestamp(usage.usage.updatedAt)}</div>
          ) : null}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Recent activity</h2>
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            background: "#fafafa",
            maxWidth: 400,
          }}
        >
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {[
              { label: "Document uploaded", sub: "medical-records.pdf · Today", href: "/dashboard/review" },
              { label: "Case created", sub: "Smith v. Jones · Yesterday", href: "/cases" },
              { label: "Records request created", sub: "Memorial Hospital · 2 days ago", href: "/records-requests" },
            ].map((item, i) => (
              <li
                key={`placeholder-${i}`}
                style={{
                  padding: "8px 0",
                  borderBottom: i < 2 ? "1px solid #eee" : "none",
                }}
              >
                <Link href={item.href} style={{ color: "#111", textDecoration: "none", fontWeight: 500 }}>
                  {item.label}
                </Link>
                <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>{item.sub}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {needsData?.ok && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Needs Attention</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            <NeedsAttentionCard
              title="Unmatched documents"
              tooltip="Documents that couldn't be matched to a case. Review and route manually."
              count={needsData.unmatchedDocuments.count}
              href="/dashboard/review"
              items={needsData.unmatchedDocuments.items.map((d) => ({
                href: `/documents/${d.id}`,
                label: d.originalName,
                sub: formatDate(d.createdAt),
              }))}
            />
            <NeedsAttentionCard
              title="Failed documents"
              tooltip="Documents that failed during processing. Check for errors and retry."
              count={needsData.failedDocuments.count}
              href="/dashboard"
              items={needsData.failedDocuments.items.map((d) => ({
                href: `/documents/${d.id}`,
                label: d.originalName,
                sub: formatDate(d.createdAt),
              }))}
            />
            <NeedsAttentionCard
              title="Overdue case tasks"
              tooltip="Case tasks past their due date. Follow up to keep cases on track."
              count={needsData.overdueCaseTasks.count}
              href="/dashboard/overdue-tasks"
              items={needsData.overdueCaseTasks.items.map((t) => ({
                href: `/cases/${t.caseId}?tab=tasks`,
                label: t.title,
                sub: t.dueDate ? `Due ${formatDate(t.dueDate)} (overdue)` : "Overdue",
              }))}
            />
            <NeedsAttentionCard
              title="Records requests (failed sends)"
              tooltip="Records requests that failed to send to the provider. Retry or fix contact info."
              count={needsData.recordsRequestsNeedingFollowUp.count}
              href="/dashboard/metrics"
              items={needsData.recordsRequestsNeedingFollowUp.items.map((r) => ({
                href: `/records-requests/${r.id}`,
                label: r.providerName,
                sub: r.status,
              }))}
            />
            <NeedsAttentionCard
              title="Recent system errors"
              tooltip="Recent errors from Doc Platform services. May need attention."
              count={needsData.systemErrors.count}
              href="#"
              items={needsData.systemErrors.items.map((e) => ({
                href: "#",
                label: e.service,
                sub: e.message.slice(0, 60) + (e.message.length > 60 ? "…" : ""),
              }))}
            />
          </div>
        </section>
      )}

      <DocumentsSection />
    </main>
  );
}
