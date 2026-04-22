"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatApiClientError, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { useDashboardAuth, canAccessIntegrations } from "@/contexts/DashboardAuthContext";

type MailboxRecord = {
  id: string;
  provider: string;
  imap_username: string | null;
  imap_host: string | null;
  folder: string | null;
  status: string;
  last_uid: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type BadgeTone = "neutral" | "success" | "warning" | "error";

function getBadgeStyle(tone: BadgeTone): React.CSSProperties {
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

function formatMailboxTimestamp(value: string | null): string {
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
  const [mailboxes, setMailboxes] = useState<MailboxRecord[]>([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !canAccessIntegrations(role)) return;

    let cancelled = false;
    setEmailLoading(true);
    setEmailError(null);

    fetch("/api/mailboxes", {
      headers: { Accept: "application/json", ...getAuthHeader() },
      ...getFetchOptions({ cache: "no-store" }),
    })
      .then(parseJsonResponse)
      .then((payload) => {
        if (cancelled) return;
        const data = payload as { ok?: boolean; items?: MailboxRecord[]; error?: string };
        if (!data.ok) {
          throw new Error(data.error || "Failed to load email connection status.");
        }
        setMailboxes(Array.isArray(data.items) ? data.items : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setEmailError(
          formatApiClientError(error, "Failed to load email connection status.", {
            deploymentMessage:
              "The email connection proxy returned HTML instead of JSON. Check the mounted /mailboxes API route and the active web build.",
          })
        );
      })
      .finally(() => {
        if (!cancelled) {
          setEmailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [checked, role]);

  const emailFocusRequested = searchParams.get("focus") === "email";
  const reconnectHref = "/dashboard/integrations/setup?flow=email";
  const activeMailbox = useMemo(
    () => mailboxes.find((mailbox) => mailbox.status === "active") ?? null,
    [mailboxes]
  );
  const latestMailbox = mailboxes[0] ?? null;

  const emailState = useMemo(() => {
    if (emailLoading) {
      return {
        badgeLabel: "Checking",
        badgeTone: "neutral" as const,
        buttonLabel: "Connect Email",
        description: "Checking the current email intake connection state.",
        detail: "Loading mailbox status from the API.",
      };
    }

    if (emailError) {
      return {
        badgeLabel: "Unavailable",
        badgeTone: "warning" as const,
        buttonLabel: "Connect Email",
        description: "Email intake status could not be loaded from the API.",
        detail: emailError,
      };
    }

    if (activeMailbox && !activeMailbox.last_error) {
      return {
        badgeLabel: "Connected",
        badgeTone: "success" as const,
        buttonLabel: "Reconnect Email",
        description: `Mailbox ${activeMailbox.imap_username ?? "Connected mailbox"} is active for intake.`,
        detail: `Last sync: ${formatMailboxTimestamp(activeMailbox.last_sync_at)}`,
      };
    }

    if (activeMailbox?.last_error) {
      return {
        badgeLabel: "Needs attention",
        badgeTone: "error" as const,
        buttonLabel: "Reconnect Email",
        description: `Mailbox ${activeMailbox.imap_username ?? "Connected mailbox"} is active but reporting an error.`,
        detail: activeMailbox.last_error,
      };
    }

    if (latestMailbox) {
      return {
        badgeLabel: "Disconnected",
        badgeTone: "neutral" as const,
        buttonLabel: "Reconnect Email",
        description: `Mailbox ${latestMailbox.imap_username ?? "Saved mailbox"} exists but is not active for intake.`,
        detail: latestMailbox.last_error ?? `Last sync: ${formatMailboxTimestamp(latestMailbox.last_sync_at)}`,
      };
    }

    return {
      badgeLabel: "Not connected",
      badgeTone: "neutral" as const,
      buttonLabel: "Connect Email",
      description: "Connect a firm mailbox so Onyx can ingest intake documents from email.",
      detail: "Supports Gmail, Outlook, and direct IMAP mailbox setup.",
    };
  }, [activeMailbox, emailError, emailLoading, latestMailbox]);

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
        breadcrumbs={[{ label: "Integrations" }]}
        title="Integrations"
        description="Manage the firm's Clio connection, email intake, and related sync status."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <DashboardCard title="Email intake">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              Connect a mailbox for document intake, mailbox polling, and review-queue ingestion.
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
                ...getBadgeStyle(emailState.badgeTone),
              }}
            >
              {emailState.badgeLabel}
            </span>
          </div>

          <p style={{ margin: "0 0 0.35rem", fontSize: "0.875rem", color: "var(--onyx-text)" }}>
            {emailState.description}
          </p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            {emailState.detail}
          </p>

          {emailError && (
            <div
              className="onyx-card"
              style={{
                marginTop: "1rem",
                padding: "0.875rem 1rem",
                borderColor: "var(--onyx-error)",
                background: "rgba(239, 68, 68, 0.05)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-error)" }}>{emailError}</p>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link
              href={reconnectHref}
              className="onyx-btn-primary"
              style={{ display: "inline-flex", textDecoration: "none" }}
            >
              {emailState.buttonLabel}
            </Link>
            <span style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
              The button opens the live mailbox connection flow.
            </span>
          </div>
        </DashboardCard>

        <DashboardCard title="Clio connection">
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Clio connection settings, intake routing, and related sync controls are configured by your firm administrator.
          </p>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Use the setup flow to connect Clio or update the current configuration.
          </p>
          <Link
            href="/dashboard/integrations/setup"
            className="onyx-btn-primary"
            style={{ display: "inline-flex", textDecoration: "none", marginTop: "1rem" }}
          >
            Connect to Clio
          </Link>
        </DashboardCard>
      </div>

      <DashboardCard
        title="Helpful links"
        style={{
          marginTop: "1rem",
          borderColor: emailFocusRequested ? "var(--onyx-accent)" : undefined,
          boxShadow: emailFocusRequested ? "0 0 0 1px rgba(161, 98, 7, 0.18)" : undefined,
        }}
      >
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          <li style={{ marginBottom: "0.35rem" }}>
            <Link href="/dashboard/settings" className="onyx-link">Settings</Link> - Account and preferences
          </li>
          <li style={{ marginBottom: "0.35rem" }}>
            <Link href={reconnectHref} className="onyx-link">Connect Email</Link> - Open the mailbox setup flow
          </li>
          <li>
            <Link href="/dashboard/integrations/setup" className="onyx-link">Connect to Clio</Link> - Guided setup for the Clio workflow
          </li>
        </ul>
      </DashboardCard>
    </div>
  );
}
