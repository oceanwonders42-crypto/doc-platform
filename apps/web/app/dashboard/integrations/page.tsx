"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { canAccessIntegrations, useDashboardAuth } from "@/contexts/DashboardAuthContext";

type IntegrationRecord = {
  id: string;
  provider: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type IntegrationsStatusResponse = {
  ok?: boolean;
  integrations?: IntegrationRecord[];
  mailboxes?: Array<{
    id: string;
    emailAddress: string;
    provider: string;
    lastSyncAt: string | null;
    active: boolean;
    integrationId?: string | null;
    updatedAt?: string | null;
  }>;
  error?: string;
};

type IntegrationHealthResponse = {
  ok?: boolean;
  activeIntegrations?: number;
  totalIntegrations?: number;
  mailboxes?: number;
  lastSyncAt?: string | null;
  errorCountLast24h?: number;
  connections?: IntegrationRecord[];
  error?: string;
};

type BadgeTone = "neutral" | "success" | "warning" | "error";

function getBadgeStyle(tone: BadgeTone): CSSProperties {
  switch (tone) {
    case "success":
      return { background: "rgba(34, 197, 94, 0.12)", color: "var(--onyx-success)" };
    case "warning":
      return { background: "rgba(245, 158, 11, 0.16)", color: "#b45309" };
    case "error":
      return { background: "rgba(239, 68, 68, 0.12)", color: "var(--onyx-error)" };
    default:
      return { background: "rgba(148, 163, 184, 0.16)", color: "var(--onyx-text-muted)" };
  }
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Not synced yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function IntegrationsPage() {
  const { role, checked } = useDashboardAuth();
  const searchParams = useSearchParams();
  const [statusPayload, setStatusPayload] = useState<IntegrationsStatusResponse | null>(null);
  const [healthPayload, setHealthPayload] = useState<IntegrationHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !canAccessIntegrations(role)) return;
    const base = getApiBase();
    if (!base) {
      setError("Missing API base URL.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${base}/integrations/status`, {
        headers: getAuthHeader(),
        ...getFetchOptions({ cache: "no-store" }),
      }),
      fetch(`${base}/integrations/health`, {
        headers: getAuthHeader(),
        ...getFetchOptions({ cache: "no-store" }),
      }),
    ])
      .then(async ([statusRes, healthRes]) => {
        const [statusData, healthData] = await Promise.all([
          parseJsonResponse(statusRes),
          parseJsonResponse(healthRes),
        ]);
        if (!statusRes.ok) {
          const payload = (statusData ?? {}) as IntegrationsStatusResponse;
          throw new Error(payload.error || "Failed to load Clio status.");
        }
        if (!healthRes.ok) {
          const payload = (healthData ?? {}) as IntegrationHealthResponse;
          throw new Error(payload.error || "Failed to load Clio health.");
        }
        return {
          status: (statusData ?? {}) as IntegrationsStatusResponse,
          health: (healthData ?? {}) as IntegrationHealthResponse,
        };
      })
      .then(({ status, health }) => {
        if (cancelled) return;
        setStatusPayload(status);
        setHealthPayload(health);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          formatApiClientError(loadError, "Failed to load Clio integration status.", {
            deploymentMessage:
              "The Clio integration page reached the wrong API target. Verify the mounted web build and API URL.",
          })
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [checked, role]);

  const emailFocusRequested = searchParams.get("focus") === "email";
  const emailStatusParam = searchParams.get("emailStatus");
  const emailMessageParam = searchParams.get("message");

  useEffect(() => {
    if (!emailStatusParam) return;
    if (emailStatusParam === "success") {
      setFlash(emailMessageParam || "Email connection saved.");
      const timeout = setTimeout(() => setFlash(null), 4000);
      return () => clearTimeout(timeout);
    }
    if (emailStatusParam === "error") {
      setError(emailMessageParam || "Email connection failed.");
    }
  }, [emailStatusParam, emailMessageParam]);

  const clioIntegration = useMemo(() => {
    const items = [...(statusPayload?.integrations ?? [])]
      .filter((integration) => integration.provider === "CLIO" && integration.type === "CASE_API")
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return items[0] ?? null;
  }, [statusPayload]);

  const emailIntegration = useMemo(() => {
    const items = [...(statusPayload?.integrations ?? [])]
      .filter((integration) => integration.type === "EMAIL")
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return items[0] ?? null;
  }, [statusPayload]);

  const emailMailbox = useMemo(() => {
    const items = [...(statusPayload?.mailboxes ?? [])].sort((left, right) => {
      const rightValue = Date.parse(right.updatedAt ?? right.lastSyncAt ?? "") || 0;
      const leftValue = Date.parse(left.updatedAt ?? left.lastSyncAt ?? "") || 0;
      return rightValue - leftValue;
    });
    const activeItems = items.filter((mailbox) => mailbox.active);
    const matchingMailbox = emailIntegration
      ? activeItems.find((mailbox) => mailbox.integrationId === emailIntegration.id)
      : null;
    if (matchingMailbox) return matchingMailbox;
    return activeItems[0] ?? items[0] ?? null;
  }, [emailIntegration, statusPayload]);

  const clioStatus = useMemo(() => {
    if (!clioIntegration) {
      return {
        badgeLabel: "Not connected",
        badgeTone: "neutral" as const,
        headline: "Connect Clio to keep Onyx aligned with your live case system.",
        detail: "No Clio case-management credentials are stored for this firm yet.",
      };
    }

    if (clioIntegration.status === "CONNECTED") {
      return {
        badgeLabel: "Connected",
        badgeTone: "success" as const,
        headline: "Clio is connected and available for case sync workflows.",
        detail: `Last health update: ${formatTimestamp(
          healthPayload?.connections?.find((connection) => connection.id === clioIntegration.id)?.updatedAt ??
            clioIntegration.updatedAt
        )}`,
      };
    }

    if (clioIntegration.status === "ERROR") {
      return {
        badgeLabel: "Needs attention",
        badgeTone: "error" as const,
        headline: "Clio credentials exist, but the saved connection needs attention.",
        detail: `Errors in the last 24 hours: ${healthPayload?.errorCountLast24h ?? 0}`,
      };
    }

    return {
      badgeLabel: "Disconnected",
      badgeTone: "warning" as const,
      headline: "A saved Clio integration exists, but it is not currently active.",
      detail: `Last updated: ${formatTimestamp(clioIntegration.updatedAt)}`,
    };
  }, [clioIntegration, healthPayload]);

  const emailConnectionState = useMemo(() => {
    if (!emailIntegration && !emailMailbox) {
      return {
        badgeLabel: "Not connected",
        badgeTone: "neutral" as const,
        headline: "Connect a live mailbox so Onyx can ingest emailed PDFs into the review workflow.",
        detail: "No intake mailbox is connected for this firm yet.",
      };
    }

    if (emailMailbox?.active && emailIntegration?.status === "CONNECTED") {
      return {
        badgeLabel: "Connected",
        badgeTone: "success" as const,
        headline: "Email intake is connected and ready to receive PDF attachments.",
        detail: `Mailbox ${emailMailbox.emailAddress} • Last sync ${formatTimestamp(emailMailbox.lastSyncAt)}`,
      };
    }

    if (emailIntegration?.status === "ERROR") {
      return {
        badgeLabel: "Needs attention",
        badgeTone: "error" as const,
        headline: "The saved mailbox connection is reporting an error and should be retested.",
        detail: `Errors in the last 24 hours: ${healthPayload?.errorCountLast24h ?? 0}`,
      };
    }

    return {
      badgeLabel: "Disconnected",
      badgeTone: "warning" as const,
      headline: "A mailbox connection exists, but it is not currently active.",
      detail: emailMailbox
        ? `Mailbox ${emailMailbox.emailAddress} is paused or disconnected.`
        : "Reconnect the intake mailbox to resume automatic ingestion.",
    };
  }, [emailIntegration, emailMailbox, healthPayload]);

  async function runClioTest() {
    if (!clioIntegration) return;
    const base = getApiBase();
    if (!base) {
      setError("Missing API base URL.");
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const response = await fetch(`${base}/integrations/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        } as HeadersInit,
        body: JSON.stringify({ integrationId: clioIntegration.id }),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Clio test failed.");
      }
      setFlash("Clio connection test passed.");
      setTimeout(() => setFlash(null), 3000);
    } catch (testError) {
      setError(
        formatApiClientError(testError, "Failed to test Clio.", {
          deploymentMessage:
            "The Clio test reached the wrong API target. Verify the active web build and API URL.",
        })
      );
    } finally {
      setTesting(false);
    }
  }

  async function disconnectClio() {
    if (!clioIntegration) return;
    const base = getApiBase();
    if (!base) {
      setError("Missing API base URL.");
      return;
    }
    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch(`${base}/integrations/${encodeURIComponent(clioIntegration.id)}/disconnect`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Clio disconnect failed.");
      }
      setStatusPayload((current) =>
        current
          ? {
              ...current,
              integrations: (current.integrations ?? []).map((integration) =>
                integration.id === clioIntegration.id ? { ...integration, status: "DISCONNECTED" } : integration
              ),
            }
          : current
      );
      setFlash("Clio integration disconnected.");
      setTimeout(() => setFlash(null), 3000);
    } catch (disconnectError) {
      setError(
        formatApiClientError(disconnectError, "Failed to disconnect Clio.", {
          deploymentMessage:
            "The Clio disconnect reached the wrong API target. Verify the active web build and API URL.",
        })
      );
    } finally {
      setDisconnecting(false);
    }
  }

  if (checked && !canAccessIntegrations(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can manage Clio and email connections.
          </p>
          <Link href="/dashboard" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Connect to Clio" }]}
        title="Connect to Clio"
        description="Make Clio the live case system for this firm, then keep intake and sync health visible from one place."
        action={
          <Link href="/dashboard/integrations/setup" className="onyx-btn-primary" style={{ textDecoration: "none" }}>
            {clioIntegration ? "Reconnect Clio" : "Connect to Clio"}
          </Link>
        }
      />

      {error && (
        <div
          className="onyx-card"
          style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}
        >
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{error}</p>
        </div>
      )}
      {flash && (
        <div
          className="onyx-card"
          style={{ padding: "1rem", marginBottom: "1rem", borderColor: "rgba(34, 197, 94, 0.2)" }}
        >
          <p style={{ margin: 0, color: "var(--onyx-success)", fontSize: "0.875rem" }}>{flash}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <DashboardCard title="Clio connection">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              Connect Clio first so case sync workflows can operate against the live system of record.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                ...getBadgeStyle(clioStatus.badgeTone),
              }}
            >
              {clioStatus.badgeLabel}
            </span>
          </div>

          <p style={{ margin: "0 0 0.35rem", fontSize: "0.875rem", color: "var(--onyx-text)" }}>
            {clioStatus.headline}
          </p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            {clioStatus.detail}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link
              href="/dashboard/integrations/setup"
              className="onyx-btn-primary"
              style={{ display: "inline-flex", textDecoration: "none" }}
            >
              {clioIntegration ? "Reconnect Clio" : "Connect to Clio"}
            </Link>
            <button
              type="button"
              className="onyx-btn-secondary"
              onClick={() => void runClioTest()}
              disabled={!clioIntegration || testing}
            >
              {testing ? "Testing..." : "Run test"}
            </button>
            <button
              type="button"
              className="onyx-btn-secondary"
              onClick={() => void disconnectClio()}
              disabled={!clioIntegration || disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Email intake"
          style={
            emailFocusRequested
              ? {
                  borderColor: "var(--onyx-accent)",
                  boxShadow: "0 0 0 1px rgba(161, 98, 7, 0.18)",
                }
              : undefined
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              Gmail uses a browser-based Google login. Other providers can still use direct IMAP credentials.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                ...getBadgeStyle(emailConnectionState.badgeTone),
              }}
            >
              {emailConnectionState.badgeLabel}
            </span>
          </div>

          <p style={{ margin: "0 0 0.35rem", fontSize: "0.875rem", color: "var(--onyx-text)" }}>
            {emailConnectionState.headline}
          </p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            {emailConnectionState.detail}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link
              href="/dashboard/integrations/setup?flow=email"
              className="onyx-btn-primary"
              style={{ display: "inline-flex", textDecoration: "none" }}
            >
              {emailMailbox ? "Reconnect Email" : "Connect Email"}
            </Link>
            <Link href="/dashboard/email" className="onyx-link" style={{ fontSize: "0.875rem" }}>
              Open email intake dashboard
            </Link>
          </div>
        </DashboardCard>

        <DashboardCard title="Connected systems">
          <dl style={{ margin: 0, display: "grid", gap: "0.75rem" }}>
            <div>
              <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                Active integrations
              </dt>
              <dd style={{ margin: "0.2rem 0 0", fontSize: "1.1rem", fontWeight: 700 }}>
                {loading ? "-" : healthPayload?.activeIntegrations ?? 0}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                Total saved integrations
              </dt>
              <dd style={{ margin: "0.2rem 0 0", fontSize: "1.1rem", fontWeight: 700 }}>
                {loading ? "-" : healthPayload?.totalIntegrations ?? 0}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                Intake mailbox
              </dt>
              <dd style={{ margin: "0.2rem 0 0", fontSize: "0.9rem" }}>
                {emailMailbox?.emailAddress ?? "No mailbox connected"}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                Last mailbox sync
              </dt>
              <dd style={{ margin: "0.2rem 0 0", fontSize: "0.9rem" }}>
                {formatTimestamp(emailMailbox?.lastSyncAt ?? healthPayload?.lastSyncAt)}
              </dd>
            </div>
          </dl>

          <Link
            href="/dashboard/settings/clio"
            className="onyx-link"
            style={{ display: "inline-flex", marginTop: "1rem" }}
          >
            Open detailed Clio settings
          </Link>
        </DashboardCard>
      </div>

      <DashboardCard
        title="What this page controls"
        style={{
          marginTop: "1rem",
          borderColor: emailFocusRequested ? "var(--onyx-accent)" : undefined,
          boxShadow: emailFocusRequested ? "0 0 0 1px rgba(161, 98, 7, 0.18)" : undefined,
        }}
      >
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          <li style={{ marginBottom: "0.35rem" }}>Clio and Email are both managed from this surface.</li>
          <li style={{ marginBottom: "0.35rem" }}>
            Gmail uses browser OAuth instead of a saved password field.
          </li>
          <li>
            Connection status is shown from the live integrations API instead of static copy.
          </li>
        </ul>
      </DashboardCard>
    </div>
  );
}
