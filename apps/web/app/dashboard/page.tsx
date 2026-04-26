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
import {
  formatDashboardRoleLabel,
  getDashboardWorkspaceLinks,
  type DashboardFeatureFlags,
} from "@/lib/dashboardAccess";
import { useDashboardAuth } from "@/contexts/DashboardAuthContext";
import { AssistantChatPanel } from "@/components/dashboard/AssistantChatPanel";
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
  status?: string | null;
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

type MailboxStatus = {
  connected: boolean;
  label: string;
};

type ClioStatus = {
  connected: boolean;
  label: string;
};

const FEATURE_LABELS: Record<keyof DashboardFeatureFlags, string> = {
  exports_enabled: "Exports",
  migration_batch_enabled: "Migration Batch",
  traffic_enabled: "Traffic",
  providers_enabled: "Providers",
  providers_map_enabled: "Providers Map",
  case_qa_enabled: "Case Q&A",
  missing_records_enabled: "Missing Records",
  bills_vs_treatment_enabled: "Bills vs Treatment",
  demand_drafts_enabled: "Demand Drafts",
  demand_audit_enabled: "Demand Audit",
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

function metricCard(label: string, value: string | number, detail: string, href?: string) {
  const content = (
    <div
      style={{
        border: "1px solid var(--onyx-border-subtle)",
        borderRadius: "var(--onyx-radius-md)",
        padding: "1rem",
        background: "var(--onyx-background-surface)",
        minHeight: "8rem",
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
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 750, color: "var(--onyx-text)" }}>
        {value}
      </p>
      <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-secondary)", lineHeight: 1.5 }}>
        {detail}
      </p>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="onyx-link" style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}

function featurePill(label: string, enabled: boolean) {
  return (
    <span
      key={label}
      className={`onyx-badge ${enabled ? "onyx-badge-success" : "onyx-badge-neutral"}`}
      title={enabled ? "Enabled for this firm" : "Not enabled for this firm"}
    >
      {label}: {enabled ? "on" : "off"}
    </span>
  );
}

function statusLine(label: string, connected: boolean, detail: string, href: string) {
  return (
    <Link
      href={href}
      className="onyx-link"
      style={{
        textDecoration: "none",
        border: "1px solid var(--onyx-border-subtle)",
        borderRadius: "var(--onyx-radius-md)",
        padding: "0.85rem",
        display: "grid",
        gap: "0.25rem",
      }}
    >
      <span style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
        <strong>{label}</strong>
        <span className={`onyx-badge ${connected ? "onyx-badge-success" : "onyx-badge-warning"}`}>
          {connected ? "Connected" : "Needs setup"}
        </span>
      </span>
      <span style={{ fontSize: "0.84rem", color: "var(--onyx-text-muted)" }}>{detail}</span>
    </Link>
  );
}

export default function DashboardHomePage() {
  const { role, dashboardRole, featureFlags, firm, user, isPlatformAdmin } = useDashboardAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([]);
  const [mailboxStatus, setMailboxStatus] = useState<MailboxStatus>({ connected: false, label: "Not checked" });
  const [clioStatus, setClioStatus] = useState<ClioStatus>({ connected: false, label: "Not checked" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = getApiBase();
    const headers = getAuthHeader();
    const requestInit = { headers, ...getFetchOptions() };
    const fetchJson = (path: string) => fetch(`${base}${path}`, requestInit).then(parseJsonResponse);

    Promise.allSettled([
      fetchJson("/me/metrics-summary"),
      fetchJson("/cases"),
      fetchJson("/activity-feed?limit=6"),
      fetchJson("/cases/exports/clio/history?limit=20"),
      fetchJson("/mailboxes"),
      fetchJson("/clio/status"),
    ])
      .then(([summaryRes, casesRes, activityRes, exportRes, mailboxesRes, clioRes]) => {
        if (summaryRes.status === "fulfilled") {
          const summaryData = summaryRes.value as { ok?: boolean; summary?: Summary; error?: string };
          if (summaryData.ok && summaryData.summary) {
            setSummary(summaryData.summary);
          } else {
            throw new Error(summaryData.error ?? "We couldn't load dashboard metrics.");
          }
        }

        if (casesRes.status === "fulfilled") {
          const casesData = casesRes.value as { ok?: boolean; items?: CaseItem[] };
          setCases(Array.isArray(casesData.items) ? casesData.items : []);
        }

        if (activityRes.status === "fulfilled") {
          const activityData = activityRes.value as { ok?: boolean; items?: ActivityItem[] };
          setActivity(Array.isArray(activityData.items) ? activityData.items : []);
        }

        if (exportRes.status === "fulfilled") {
          const exportData = exportRes.value as { ok?: boolean; items?: ExportHistoryItem[] };
          setExportHistory(Array.isArray(exportData.items) ? exportData.items : []);
        }

        if (mailboxesRes.status === "fulfilled") {
          const mailboxData = mailboxesRes.value as {
            ok?: boolean;
            items?: Array<{ emailAddress?: string | null; active?: boolean | null }>;
          };
          const activeMailbox = (mailboxData.items ?? []).find((item) => item.active !== false);
          setMailboxStatus({
            connected: Boolean(activeMailbox),
            label: activeMailbox?.emailAddress ?? "No mailbox connected",
          });
        }

        if (clioRes.status === "fulfilled") {
          const clioData = clioRes.value as {
            ok?: boolean;
            connected?: boolean;
            accountName?: string | null;
            account?: { name?: string | null };
          };
          setClioStatus({
            connected: clioData.connected === true,
            label: clioData.accountName ?? clioData.account?.name ?? "No Clio account connected",
          });
        }

        setError(null);
      })
      .catch((requestError) => {
        setError(
          formatApiClientError(
            requestError,
            "We couldn't load the dashboard. Please try again.",
            {
              deploymentMessage:
                "The dashboard API returned HTML instead of JSON. Check the active API host, deploy version, and web build API URL.",
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

  const workspaceLinks = getDashboardWorkspaceLinks(role, featureFlags);
  const enabledFeatureCount = Object.values(featureFlags).filter(Boolean).length;
  const roleLabel = formatDashboardRoleLabel(role);
  const activeCaseCount = cases.length;
  const blockedItems = (summary?.unmatchedDocs ?? 0) + (summary?.needsReviewDocs ?? 0);

  const headerDescription =
    dashboardRole === "FIRM_ADMIN" || dashboardRole === "PLATFORM_ADMIN"
      ? "Business health, team access, integrations, usage, and firm feature controls."
      : "Your active legal-work queue: cases, demands, records requests, alerts, and provider lookup.";

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[]}
        title={`${roleLabel} dashboard`}
        description={headerDescription}
      />

      {error ? (
        <ErrorNotice
          message={error}
          action={
            <button type="button" onClick={() => window.location.reload()} className="onyx-btn-secondary">
              Reload dashboard
            </button>
          }
          style={{ marginBottom: "1rem" }}
        />
      ) : null}

      <DashboardCard
        title={firm?.name ? `${firm.name} at a glance` : "Your workspace at a glance"}
        style={{ marginBottom: "1.25rem" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem" }}>
          {metricCard(
            "Documents processed",
            loading ? "..." : summary?.docsProcessedThisMonth ?? 0,
            `${summary?.docsProcessedToday ?? 0} processed today`,
            "/dashboard/documents"
          )}
          {metricCard(
            "Needs review",
            loading ? "..." : summary?.needsReviewDocs ?? 0,
            (summary?.needsReviewDocs ?? 0) > 0 ? "Open the review queue next." : "Review queue is clear.",
            "/dashboard/review"
          )}
          {metricCard(
            "Active cases",
            loading ? "..." : activeCaseCount,
            activeCaseCount > 0 ? "Case workspaces are ready." : "No active cases are visible yet.",
            dashboardRole === "FIRM_ADMIN" || dashboardRole === "PLATFORM_ADMIN" ? undefined : "/dashboard/cases"
          )}
          {metricCard(
            "Blocked items",
            loading ? "..." : blockedItems,
            blockedItems > 0 ? "Routing or review needs attention." : "No routing blockers detected.",
            blockedItems > 0 ? "/dashboard/review" : undefined
          )}
        </div>
      </DashboardCard>

      {(dashboardRole === "FIRM_ADMIN" || dashboardRole === "PLATFORM_ADMIN") ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)", gap: "1rem" }}>
          <DashboardCard title="Firm health and access">
            <div style={{ display: "grid", gap: "0.9rem" }}>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--onyx-text-secondary)", lineHeight: 1.55 }}>
                Plan: <strong>{firm?.plan ?? "unknown"}</strong>. Feature access is controlled by tier plus developer overrides,
                and unavailable features stay hidden from operators.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {Object.entries(FEATURE_LABELS).map(([key, label]) =>
                  featurePill(label, featureFlags[key as keyof DashboardFeatureFlags])
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <Link href="/dashboard/usage" style={{ textDecoration: "none" }}>
                  <button type="button" className="onyx-btn-secondary">Usage and costs</button>
                </Link>
                <Link href="/dashboard/team" style={{ textDecoration: "none" }}>
                  <button type="button" className="onyx-btn-secondary">Team activity</button>
                </Link>
                <Link href="/dashboard/settings/firm" style={{ textDecoration: "none" }}>
                  <button type="button" className="onyx-btn-secondary">Firm settings</button>
                </Link>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard title="Integration status">
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {statusLine("Gmail", mailboxStatus.connected, mailboxStatus.label, "/dashboard/email")}
              {statusLine("Clio", clioStatus.connected, clioStatus.label, "/dashboard/settings/clio")}
              {metricCard("Enabled firm features", enabledFeatureCount, "Developer-controlled flags currently active")}
            </div>
          </DashboardCard>

          {isPlatformAdmin ? (
            <DashboardCard title="Developer controls">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                <Link href="/admin/firms" className="onyx-link">Firm access controls</Link>
                <Link href="/admin/quality" className="onyx-link">Demand audit queue</Link>
                <Link href="/admin/errors" className="onyx-link">Recent AI errors</Link>
                <Link href="/admin/jobs" className="onyx-link">Failed jobs</Link>
                <Link href="/admin/demand-templates" className="onyx-link">Demand templates</Link>
              </div>
            </DashboardCard>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 0.9fr)", gap: "1rem" }}>
          <DashboardCard title="What to work next">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem" }}>
              {metricCard("Documents needing review", loading ? "..." : summary?.needsReviewDocs ?? 0, "Review routing, OCR, and classification.", "/dashboard/review")}
              {metricCard("Assigned cases", loading ? "..." : activeCaseCount, "Open cases with active records and demand work.", "/dashboard/cases")}
              {metricCard("Demand drafts", featureFlags.demand_drafts_enabled ? "Enabled" : "Off", "Review-ready drafts only. Nothing auto-sends.", featureFlags.demand_drafts_enabled ? "/dashboard/demands" : undefined)}
              {metricCard("Records requests", "Open", "Create and track missing-record requests.", "/dashboard/records-requests")}
            </div>
          </DashboardCard>

          <DashboardCard title="Alerts">
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-secondary)", lineHeight: 1.55 }}>
                {(summary?.unmatchedDocs ?? 0) === 0
                  ? "No unmatched documents are waiting right now."
                  : `${summary?.unmatchedDocs ?? 0} document${summary?.unmatchedDocs === 1 ? "" : "s"} need safe routing review.`}
              </p>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-secondary)", lineHeight: 1.55 }}>
                {featureFlags.missing_records_enabled
                  ? "Missing-records alerts are available inside each case."
                  : "Missing-records analysis is not enabled for this firm yet."}
              </p>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-secondary)", lineHeight: 1.55 }}>
                {featureFlags.bills_vs_treatment_enabled
                  ? "Bills vs treatment review is available inside each case."
                  : "Bills vs treatment review is not enabled for this firm yet."}
              </p>
              {featureFlags.providers_map_enabled ? (
                <Link href="/dashboard/providers/map" className="onyx-link">Open provider map</Link>
              ) : null}
            </div>
          </DashboardCard>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        <DashboardCard title="Allowed workspace">
          {workspaceLinks.length === 0 ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
              No additional workspace lanes are enabled for this role yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.65rem" }}>
              {workspaceLinks.map((item) => (
                <Link key={item.id} href={item.href} className="onyx-link" style={{ textDecoration: "none" }}>
                  <strong>{item.label}</strong>
                  {item.description ? (
                    <span style={{ display: "block", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                      {item.description}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Recent activity">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading activity...</p>
          ) : activity.length === 0 ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>No recent activity has been recorded yet.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.8rem" }}>
              {activity.map((item) => (
                <li key={item.id} style={{ paddingBottom: "0.8rem", borderBottom: "1px solid var(--onyx-border-subtle)" }}>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>{item.title || item.type}</p>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    {formatRelativeTime(item.createdAt)}
                    {item.caseId ? (
                      <>
                        {" - "}
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

        <DashboardCard title="Demand and Clio handoff">
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-secondary)", lineHeight: 1.55 }}>
            {exportHistory.length === 0
              ? "No recent Clio handoffs are recorded."
              : `${exportHistory.length} recent handoff operation${exportHistory.length === 1 ? "" : "s"} included ${exportedCaseCount} case${exportedCaseCount === 1 ? "" : "s"}.`}
          </p>
          {featureFlags.exports_enabled ? (
            <Link href="/dashboard/exports" className="onyx-link" style={{ display: "inline-block", marginTop: "0.65rem" }}>
              Open exports
            </Link>
          ) : (
            <p style={{ margin: "0.65rem 0 0", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
              Exports are hidden until enabled for this firm and role.
            </p>
          )}
        </DashboardCard>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <DashboardCard title="AI assistant">
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-secondary)", lineHeight: 1.55 }}>
            Ask the assistant about app navigation, firm status, active cases, review queues, and enabled AI workflows.
            Case-specific questions are grounded in the case workspace.
          </p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
            Signed in as {user?.email ?? "unknown user"}.
          </p>
          <div style={{ marginTop: "0.85rem" }}>
            <AssistantChatPanel placeholder="Ask about firm status, integrations, review queues, or enabled features..." />
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
