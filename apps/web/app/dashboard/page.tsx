"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ErrorNotice } from "@/components/dashboard/ErrorNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";

type Summary = {
  docsProcessedThisMonth: number;
  docsProcessedToday?: number;
  unmatchedDocs: number;
  needsReviewDocs: number;
};

type CaseItem = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
};

type ActivityItem = {
  id: string;
  title: string;
  type: string;
  caseId: string | null;
  createdAt: string;
};

type ExportHistoryItem = {
  exportId: string;
  includedCases?: Array<{ caseId: string }>;
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function DashboardHomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = getApiBase();
    const headers = getAuthHeader();
    const requestInit = { headers, ...getFetchOptions() };

    Promise.all([
      fetch(`${base}/me/metrics-summary`, requestInit).then(parseJsonResponse),
      fetch(`${base}/cases`, requestInit).then(parseJsonResponse),
      fetch(`${base}/activity-feed?limit=6`, requestInit).then(parseJsonResponse),
      fetch(`${base}/cases/exports/clio/history?limit=20`, requestInit).then(parseJsonResponse),
    ])
      .then(([summaryRes, casesRes, activityRes, exportRes]) => {
        const summaryData = summaryRes as { ok?: boolean; summary?: Summary; error?: string };
        const casesData = casesRes as { ok?: boolean; items?: CaseItem[] };
        const activityData = activityRes as { ok?: boolean; items?: ActivityItem[] };
        const exportData = exportRes as { ok?: boolean; items?: ExportHistoryItem[] };

        if (!summaryData.ok || !summaryData.summary) {
          throw new Error(summaryData.error ?? "We couldn't load the dashboard pipeline.");
        }

        setSummary(summaryData.summary);
        setCases(Array.isArray(casesData.items) ? casesData.items : []);
        setActivity(Array.isArray(activityData.items) ? activityData.items : []);
        setExportHistory(Array.isArray(exportData.items) ? exportData.items : []);
        setError(null);
      })
      .catch((requestError) => {
        setError(
          formatApiClientError(
            requestError,
            "We couldn't load the dashboard pipeline. Please try again.",
            {
              deploymentMessage:
                "The dashboard API returned HTML instead of JSON. Check the active API host, the current deploy version, and whether web is still serving an older build.",
            }
          )
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const exportedCaseCount = useMemo(
    () =>
      exportHistory.reduce((total, item) => {
        const includedCount = Array.isArray(item.includedCases) ? item.includedCases.length : 0;
        return total + (includedCount > 0 ? includedCount : 1);
      }, 0),
    [exportHistory]
  );

  const pipeline = [
    {
      label: "Documents",
      href: "/dashboard/documents",
      value: summary?.docsProcessedThisMonth ?? 0,
      detail: `${summary?.docsProcessedToday ?? 0} processed today`,
      footnote: `${summary?.unmatchedDocs ?? 0} unmatched still need routing review`,
    },
    {
      label: "Review",
      href: "/dashboard/review",
      value: summary?.needsReviewDocs ?? 0,
      detail: "documents waiting for operator review",
      footnote: (summary?.needsReviewDocs ?? 0) > 0 ? "Open the review queue next." : "Review queue is currently clear.",
    },
    {
      label: "Cases",
      href: "/dashboard/cases",
      value: cases.length,
      detail: "active visible cases",
      footnote: cases.length > 0 ? "Case workspace is ready for chronology and exports." : "No active cases are visible yet.",
    },
    {
      label: "Exports",
      href: "/dashboard/exports",
      value: exportedCaseCount,
      detail: "recorded handoff cases in recent history",
      footnote: `${exportHistory.length} recent export operation${exportHistory.length === 1 ? "" : "s"} tracked`,
    },
  ];

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[]}
        title="Operations pipeline"
        description="Track intake, review, case work, and export progress from one honest operator view."
      />

      {error ? (
        <ErrorNotice
          message={error}
          action={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="onyx-btn-secondary"
            >
              Reload dashboard
            </button>
          }
          style={{ marginBottom: "1rem" }}
        />
      ) : null}

      <DashboardCard title="Documents → Review → Cases → Exports" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          {pipeline.map((step, index) => (
            <Link
              key={step.label}
              href={step.href}
              className="onyx-link"
              style={{
                textDecoration: "none",
                border: "1px solid var(--onyx-border-subtle)",
                borderRadius: "var(--onyx-radius-md)",
                padding: "1rem",
                background: "var(--onyx-background-surface)",
                display: "grid",
                gap: "0.45rem",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--onyx-text-muted)",
                }}
              >
                Step {index + 1}
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.55rem" }}>
                <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--onyx-text)" }}>
                  {loading ? "…" : step.value}
                </span>
                <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--onyx-text)" }}>{step.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-secondary)", lineHeight: 1.5 }}>
                {step.detail}
              </p>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
                {step.footnote}
              </p>
            </Link>
          ))}
        </div>
      </DashboardCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <DashboardCard title="What needs attention next">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--onyx-text)" }}>
                Intake routing
              </p>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
                {(summary?.unmatchedDocs ?? 0) === 0
                  ? "No unmatched documents are waiting right now."
                  : `${summary?.unmatchedDocs ?? 0} document${summary?.unmatchedDocs === 1 ? "" : "s"} still need safe case routing.`}
              </p>
            </div>
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--onyx-text)" }}>
                Review queue
              </p>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
                {(summary?.needsReviewDocs ?? 0) === 0
                  ? "No documents are blocked in review."
                  : `${summary?.needsReviewDocs ?? 0} document${summary?.needsReviewDocs === 1 ? "" : "s"} are waiting on operator review before case work can continue.`}
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <Link href="/dashboard/documents" style={{ textDecoration: "none" }}>
                <button type="button" className="onyx-btn-primary">Open documents</button>
              </Link>
              <Link href="/dashboard/review" style={{ textDecoration: "none" }}>
                <button type="button" className="onyx-btn-secondary">Open review</button>
              </Link>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Recent operator activity">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading activity…</p>
          ) : activity.length === 0 ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
              No recent operator activity has been recorded yet.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.8rem" }}>
              {activity.map((item) => (
                <li
                  key={item.id}
                  style={{
                    paddingBottom: "0.8rem",
                    borderBottom: "1px solid var(--onyx-border-subtle)",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>{item.title || item.type}</p>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    {formatRelativeTime(item.createdAt)}
                    {item.caseId ? (
                      <>
                        {" • "}
                        <Link href={`/dashboard/cases/${item.caseId}`} className="onyx-link">
                          Open case
                        </Link>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard title="Export status">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
              Exports are tracked from recent Clio handoff history so the pipeline reflects real recorded work instead of placeholder counters.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
              <div className="onyx-card" style={{ padding: "0.9rem 1rem" }}>
                <p style={{ margin: "0 0 0.2rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
                  Recent handoffs
                </p>
                <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>{loading ? "…" : exportHistory.length}</p>
              </div>
              <div className="onyx-card" style={{ padding: "0.9rem 1rem" }}>
                <p style={{ margin: "0 0 0.2rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
                  Cases included
                </p>
                <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>{loading ? "…" : exportedCaseCount}</p>
              </div>
            </div>
            <Link href="/dashboard/exports" className="onyx-link">
              Open exports lane →
            </Link>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
