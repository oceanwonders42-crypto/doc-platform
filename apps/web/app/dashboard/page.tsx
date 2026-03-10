"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatsWidget } from "@/components/dashboard/StatsWidget";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { useI18n } from "@/contexts/I18nContext";

type Summary = {
  docsProcessedThisMonth: number;
  docsProcessedToday?: number;
  pagesProcessedThisMonth: number;
  unmatchedDocs: number;
  needsReviewDocs: number;
  recordsRequestsCreatedThisMonth: number;
  notificationsUnread: number;
};

type TrendPoint = { day: string; docsProcessed: number; recordsRequests: number };

type CaseItem = { id: string; title: string; caseNumber: string | null; clientName: string | null; createdAt: string };

type ActivityItem = {
  id: string;
  caseId: string | null;
  documentId: string | null;
  type: string;
  title: string;
  createdAt: string;
};

type QueueStatus = {
  ok: boolean;
  db?: { queued: number; running: number; failed: number };
  documentPipelinePending?: number;
};

type MetricsSummaryResponse = { ok?: boolean; summary?: Summary; trend?: TrendPoint[]; error?: string };

function isMetricsSummaryResponse(res: unknown): res is MetricsSummaryResponse {
  return typeof res === "object" && res !== null;
}

type CasesListResponse = { ok?: boolean; items?: CaseItem[] };

function isCasesListResponse(res: unknown): res is CasesListResponse {
  return typeof res === "object" && res !== null;
}

type ActivityFeedResponse = { ok?: boolean; items?: ActivityItem[] };

function isActivityFeedResponse(res: unknown): res is ActivityFeedResponse {
  return typeof res === "object" && res !== null;
}

function isQueueStatusResponse(res: unknown): res is QueueStatus {
  return typeof res === "object" && res !== null;
}

function formatRelativeTime(iso: string, t: (k: string) => string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return t("common.justNow");
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function DashboardHomePage() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [needsAttention, setNeedsAttention] = useState<{
    overdueCaseTasks: { count: number; items: { id: string; title: string; dueDate: string | null; caseId: string | null }[] };
    recordsRequestsNeedingFollowUp: { count: number; items: { id: string; providerName: string | null; caseId: string | null; status: string; createdAt: string }[] };
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingNeedsAttention, setLoadingNeedsAttention] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = getApiBase();
    const headers = getAuthHeader();
    const opts = getFetchOptions();

    fetch(`${base}/me/metrics-summary`, { headers, ...opts })
      .then(parseJsonResponse)
      .then((metricsRes: unknown) => {
        if (isMetricsSummaryResponse(metricsRes)) {
          if (metricsRes.ok && metricsRes.summary) setSummary(metricsRes.summary);
          if (metricsRes.ok && Array.isArray(metricsRes.trend)) setTrend(metricsRes.trend);
          if (!metricsRes.ok && !metricsRes.summary) setError(metricsRes.error ?? "Failed to load metrics");
        }
      })
      .catch(() => setError("Failed to load metrics"))
      .finally(() => setLoadingSummary(false));

    fetch(`${base}/cases`, { headers, ...opts })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isCasesListResponse(res) && res.ok && Array.isArray(res.items)) setCases(res.items);
      })
      .catch(() => {})
      .finally(() => setLoadingCases(false));

    fetch(`${base}/activity-feed?limit=10`, { headers, ...opts })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isActivityFeedResponse(res) && res.ok && Array.isArray(res.items)) setActivity(res.items);
      })
      .catch(() => {})
      .finally(() => setLoadingActivity(false));

    fetch(`${base}/me/queue-status`, { headers, ...opts })
      .then(parseJsonResponse)
      .then((queueRes: unknown) => {
        if (isQueueStatusResponse(queueRes) && queueRes.ok) setQueueStatus(queueRes);
      })
      .catch(() => {})
      .finally(() => setLoadingQueue(false));

    fetch(`${base}/me/needs-attention`, { headers, ...opts })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as {
          ok?: boolean;
          overdueCaseTasks?: { count: number; items: { id: string; title: string; dueDate: string | null; caseId: string | null }[] };
          recordsRequestsNeedingFollowUp?: { count: number; items: { id: string; providerName: string | null; caseId: string | null; status: string; createdAt: string }[] };
        };
        if (r.ok && r.overdueCaseTasks && r.recordsRequestsNeedingFollowUp)
          setNeedsAttention({ overdueCaseTasks: r.overdueCaseTasks, recordsRequestsNeedingFollowUp: r.recordsRequestsNeedingFollowUp });
      })
      .catch(() => {})
      .finally(() => setLoadingNeedsAttention(false));
  }, []);

  if (error && !summary) {
    return (
      <div className="dashboard-page" style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[]} title={t("dashboard.title")} />
        <div className="onyx-card" style={{ padding: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
        </div>
      </div>
    );
  }

  const caseCount = cases.length;
  const pendingCount =
    (queueStatus?.documentPipelinePending ?? 0) + (queueStatus?.db?.queued ?? 0) + (queueStatus?.db?.running ?? 0);
  const hasData = caseCount > 0 || (summary && (summary.docsProcessedThisMonth > 0 || summary.recordsRequestsCreatedThisMonth > 0));
  const anyLoading = loadingSummary || loadingCases || loadingActivity || loadingQueue || loadingNeedsAttention;
  const docsToday = summary?.docsProcessedToday ?? summary?.docsProcessedThisMonth ?? 0;
  const overdueTotal = (needsAttention?.overdueCaseTasks?.count ?? 0) + (needsAttention?.recordsRequestsNeedingFollowUp?.count ?? 0);

  return (
    <div className="dashboard-page" style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[]}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      />

      {/* Top summary cards — case-centric */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <Link href="/dashboard/cases" className="onyx-link" style={{ textDecoration: "none" }}>
          <StatsWidget
            label={t("nav.cases")}
            value={loadingCases ? "" : caseCount}
            subtext={loadingCases ? undefined : t("dashboard.activeCases")}
            skeleton={loadingCases}
          />
        </Link>
        <Link href="/dashboard/documents" className="onyx-link" style={{ textDecoration: "none" }}>
          <StatsWidget
            label={t("dashboard.documentsToday")}
            value={loadingSummary ? "" : (typeof summary?.docsProcessedToday === "number" ? summary.docsProcessedToday : summary?.docsProcessedThisMonth ?? 0)}
            subtext={loadingSummary ? undefined : (typeof summary?.docsProcessedToday === "number" ? t("dashboard.today") : t("dashboard.thisMonth"))}
            skeleton={loadingSummary}
          />
        </Link>
        <Link href="/dashboard/review" className="onyx-link" style={{ textDecoration: "none" }}>
          <StatsWidget
            label={t("dashboard.needsReview")}
            value={loadingSummary ? "" : (summary?.needsReviewDocs ?? 0)}
            subtext={loadingSummary ? undefined : t("dashboard.documents")}
            skeleton={loadingSummary}
          />
        </Link>
        <Link href="/dashboard/cases" className="onyx-link" style={{ textDecoration: "none" }}>
          <StatsWidget
            label={t("dashboard.missingRecords")}
            value={loadingSummary ? "" : (summary?.unmatchedDocs ?? 0)}
            subtext={t("dashboard.unmatchedDocs")}
            skeleton={loadingSummary}
          />
        </Link>
        <Link href="/dashboard/chronologies" className="onyx-link" style={{ textDecoration: "none" }}>
          <StatsWidget
            label={t("dashboard.chronologiesInProgress")}
            value={loadingCases ? "" : caseCount}
            subtext={loadingCases ? undefined : t("dashboard.activeCases")}
            skeleton={loadingCases}
          />
        </Link>
        <Link href="/dashboard/demands" className="onyx-link" style={{ textDecoration: "none" }}>
          <StatsWidget
            label={t("dashboard.demandsInProgress")}
            value={loadingCases ? "" : caseCount}
            subtext={loadingCases ? undefined : t("dashboard.activeCases")}
            skeleton={loadingCases}
          />
        </Link>
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <Link href="/dashboard/documents" style={{ textDecoration: "none" }}>
          <button type="button" className="onyx-btn-primary" style={{ padding: "0.5rem 1rem" }}>
            {t("dashboard.uploadDocuments")}
          </button>
        </Link>
        <Link href="/dashboard/review" style={{ textDecoration: "none" }}>
          <button type="button" className="onyx-btn-secondary">
            {t("dashboard.reviewQueue")}
          </button>
        </Link>
        <Link href="/dashboard/records-requests/new" style={{ textDecoration: "none" }}>
          <button type="button" className="onyx-btn-secondary">
            {t("dashboard.newRecordsRequest")}
          </button>
        </Link>
        <Link href="/dashboard/cases" style={{ textDecoration: "none" }}>
          <button type="button" className="onyx-btn-secondary">
            {t("dashboard.viewAllCases")}
          </button>
        </Link>
      </div>

      {/* Main panels: Review Queue, Recently Updated Cases, Missing Doc Alerts, AI Exceptions, Overdue, Team */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "1.25rem",
        }}
      >
        <DashboardCard title={t("dashboard.reviewQueue")}>
          {loadingSummary ? (
            <div className="onyx-skeleton" style={{ width: "100%", height: 40 }} />
          ) : (
            <>
              <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "var(--onyx-text)" }}>
                {summary?.needsReviewDocs ?? 0}
              </p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                documents need review
              </p>
              <Link href="/dashboard/review" className="onyx-link" style={{ display: "inline-block", marginTop: "0.75rem", fontSize: "0.875rem" }}>
                Open review queue →
              </Link>
            </>
          )}
        </DashboardCard>

        <DashboardCard title={t("dashboard.recentlyUpdatedCases")}>
          {loadingCases ? (
            <div className="onyx-skeleton" style={{ width: "100%", height: 60 }} />
          ) : cases.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{t("dashboard.noRecentActivity")}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.875rem" }}>
              {cases.slice(0, 4).map((c) => (
                <li key={c.id} style={{ padding: "0.35rem 0", borderBottom: "1px solid var(--onyx-border-subtle)" }}>
                  <Link href={`/dashboard/cases/${c.id}`} className="onyx-link">
                    {c.clientName || c.title || c.caseNumber || "Case"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/dashboard/cases" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.8125rem" }}>
            View all cases →
          </Link>
        </DashboardCard>

        <DashboardCard title={t("dashboard.missingDocAlerts")}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            {t("dashboard.noMissingAlerts")}
          </p>
        </DashboardCard>

        <DashboardCard title={t("dashboard.aiExceptions")}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            {t("dashboard.noAIExceptions")}
          </p>
        </DashboardCard>

        <DashboardCard title={t("dashboard.overdueRecordsRequests")}>
          {loadingNeedsAttention ? (
            <div className="onyx-skeleton" style={{ width: "100%", height: 40 }} />
          ) : overdueTotal === 0 ? (
            <>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                {t("dashboard.noOverdue")}
              </p>
              <Link href="/dashboard/records-requests" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.8125rem" }}>
                Records requests →
              </Link>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "var(--onyx-text)" }}>
                {overdueTotal} need attention
              </p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                {needsAttention?.overdueCaseTasks?.count ?? 0} overdue task(s), {needsAttention?.recordsRequestsNeedingFollowUp?.count ?? 0} records request(s) needing follow-up
              </p>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                {needsAttention?.overdueCaseTasks?.items?.slice(0, 2).map((t) => (
                  <li key={t.id}>
                    {t.caseId ? <Link href={`/dashboard/cases/${t.caseId}`} className="onyx-link">{t.title || "Task"}</Link> : t.title || "Task"}
                  </li>
                ))}
                {needsAttention?.recordsRequestsNeedingFollowUp?.items?.slice(0, 2).map((r) => (
                  <li key={r.id}>
                    <Link href={`/dashboard/records-requests/${r.id}`} className="onyx-link">{r.providerName || "Records request"}</Link>
                  </li>
                ))}
              </ul>
              <Link href="/dashboard/records-requests" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.8125rem" }}>
                Records requests →
              </Link>
            </>
          )}
        </DashboardCard>

        <DashboardCard title={t("dashboard.teamWorkload")}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            {t("dashboard.teamWorkloadDescription")}
          </p>
          <Link href="/dashboard/team" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.8125rem" }}>
            View team →
          </Link>
        </DashboardCard>
      </div>

      {/* Recent activity + Trends — keep below panels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "1.25rem",
          maxWidth: 960,
          marginTop: "1.5rem",
        }}
      >
        <DashboardCard title={t("dashboard.recentActivity")}>
          {loadingActivity ? (
            <>
              <div className="onyx-skeleton" style={{ width: "100%", height: 12, marginBottom: 10 }} />
              <div className="onyx-skeleton" style={{ width: "90%", height: 12, marginBottom: 10 }} />
              <div className="onyx-skeleton" style={{ width: "70%", height: 12 }} />
            </>
          ) : activity.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
              {t("dashboard.noRecentActivity")}
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.875rem" }}>
              {activity.map((a, index) => (
                <li
                  key={a.id}
                  style={{
                    padding: "0.5rem 0",
                    borderBottom: index < activity.length - 1 ? "1px solid var(--onyx-border-subtle)" : "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.2rem",
                  }}
                >
                  <span style={{ color: "var(--onyx-text-muted)", fontSize: "0.75rem" }}>
                    {formatRelativeTime(a.createdAt, t)} · {a.type}
                  </span>
                  {a.caseId ? (
                    <Link href={`/dashboard/cases/${a.caseId}`} className="onyx-link">
                      {a.title || t("nav.cases")}
                    </Link>
                  ) : a.documentId ? (
                    <Link href={`/dashboard/documents/${a.documentId}`} className="onyx-link">
                      {a.title || t("nav.documents")}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--onyx-text)" }}>{a.title}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard title={t("dashboard.trendsAndInsights")}>
          {loadingSummary ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div className="onyx-skeleton" style={{ width: 120, height: 12, marginBottom: 8 }} />
              <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 80 }}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="onyx-skeleton" style={{ flex: 1, minWidth: 4, height: `${20 + (i % 5) * 15}%` }} />
                ))}
              </div>
            </div>
          ) : trend.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
              {t("dashboard.trendEmpty")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
                {t("dashboard.last30Days")} · {t("dashboard.docsProcessed")}
              </p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 80 }}>
                {(() => {
                  const slice = trend.slice(-14);
                  const max = Math.max(1, ...slice.map((x) => x.docsProcessed));
                  return slice.map((tp) => {
                    const h = (tp.docsProcessed / max) * 100;
                    return (
                      <div
                        key={tp.day}
                        title={`${tp.day}: ${tp.docsProcessed}`}
                        style={{
                          flex: 1,
                          minWidth: 4,
                          height: `${Math.max(4, h)}%`,
                          backgroundColor: "var(--onyx-accent)",
                          borderRadius: "var(--onyx-radius-sm)",
                          opacity: 0.9,
                        }}
                      />
                    );
                  });
                })()}
              </div>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted-soft)" }}>
                {t("dashboard.docsProcessed")}
              </p>
            </div>
          )}
        </DashboardCard>
      </div>

      {/* Empty state when no data at all */}
      {!hasData && !anyLoading && (
        <DashboardCard
          style={{
            marginTop: "1.5rem",
            maxWidth: 480,
            textAlign: "center",
            padding: "2rem 1.5rem",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: 600, color: "var(--onyx-text)" }}>
            {t("dashboard.emptyStateTitle")}
          </h3>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
            {t("dashboard.emptyStateDescription")}
          </p>
          <div style={{ marginTop: "1.25rem" }}>
            <Link href="/dashboard/documents" style={{ textDecoration: "none" }}>
              <button type="button" className="onyx-btn-primary">
                {t("dashboard.uploadDocuments")}
              </button>
            </Link>
          </div>
        </DashboardCard>
      )}
    </div>
  );
}
