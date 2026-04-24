"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
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
  type: string;
  provider: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type IntegrationMailbox = {
  id: string;
  emailAddress: string;
  provider: string;
  lastSyncAt: string | null;
  active: boolean;
};

type IntegrationsStatusResponse = {
  ok?: boolean;
  integrations?: IntegrationRecord[];
  mailboxes?: IntegrationMailbox[];
  error?: string;
};

type IntegrationHealthResponse = {
  ok?: boolean;
  activeIntegrations?: number;
  totalIntegrations?: number;
  mailboxes?: number;
  lastSyncAt?: string | null;
  errorCountLast24h?: number;
  connections?: Array<{
    id: string;
    type: string;
    provider: string;
    status: string;
    updatedAt: string;
  }>;
  error?: string;
};

type ClioSettingsPayload = {
  clioDefaultAllowDocumentUpload?: boolean;
  clioDefaultAllowMatterNotes?: boolean;
  clioDefaultAllowClaimNumberSync?: boolean;
  clioConnectedAccountLabel?: string;
};

const badgeStyles: Record<string, CSSProperties> = {
  connected: {
    background: "rgba(34, 197, 94, 0.12)",
    color: "var(--onyx-success)",
  },
  warning: {
    background: "rgba(245, 158, 11, 0.16)",
    color: "#b45309",
  },
  disconnected: {
    background: "rgba(148, 163, 184, 0.16)",
    color: "var(--onyx-text-muted)",
  },
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Not available yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function normalizeClioDefaults(settings: ClioSettingsPayload | null): Required<ClioSettingsPayload> {
  return {
    clioDefaultAllowDocumentUpload: settings?.clioDefaultAllowDocumentUpload ?? true,
    clioDefaultAllowMatterNotes: settings?.clioDefaultAllowMatterNotes ?? true,
    clioDefaultAllowClaimNumberSync: settings?.clioDefaultAllowClaimNumberSync ?? false,
    clioConnectedAccountLabel: settings?.clioConnectedAccountLabel ?? "",
  };
}

export function ClioSettingsView() {
  const { checked, role } = useDashboardAuth();
  const canManage = canAccessIntegrations(role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusPayload, setStatusPayload] = useState<IntegrationsStatusResponse | null>(null);
  const [healthPayload, setHealthPayload] = useState<IntegrationHealthResponse | null>(null);
  const [savedSettings, setSavedSettings] = useState<Required<ClioSettingsPayload>>(
    normalizeClioDefaults(null)
  );
  const [draftSettings, setDraftSettings] = useState<Required<ClioSettingsPayload>>(
    normalizeClioDefaults(null)
  );
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !canManage) return;
    const base = getApiBase();
    if (!base) {
      setError("Missing API base URL.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const [statusRes, healthRes, settingsRes] = await Promise.all([
          fetch(`${base}/integrations/status`, {
            headers: getAuthHeader(),
            ...getFetchOptions({ cache: "no-store" }),
          }),
          fetch(`${base}/integrations/health`, {
            headers: getAuthHeader(),
            ...getFetchOptions({ cache: "no-store" }),
          }),
          fetch(`${base}/me/settings`, {
            headers: getAuthHeader(),
            ...getFetchOptions({ cache: "no-store" }),
          }),
        ]);

        const [statusData, healthData, settingsData] = await Promise.all([
          parseJsonResponse(statusRes),
          parseJsonResponse(healthRes),
          parseJsonResponse(settingsRes),
        ]);

        if (cancelled) return;

        const nextStatus = (statusData ?? {}) as IntegrationsStatusResponse;
        const nextHealth = (healthData ?? {}) as IntegrationHealthResponse;
        const nextSettings = normalizeClioDefaults((settingsData ?? {}) as ClioSettingsPayload);

        if (!statusRes.ok) {
          throw new Error(nextStatus.error || "Failed to load Clio integration status.");
        }
        if (!healthRes.ok) {
          throw new Error(nextHealth.error || "Failed to load Clio connection health.");
        }
        if (!settingsRes.ok) {
          throw new Error("Failed to load Clio defaults.");
        }

        setStatusPayload(nextStatus);
        setHealthPayload(nextHealth);
        setSavedSettings(nextSettings);
        setDraftSettings(nextSettings);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            formatApiClientError(loadError, "Failed to load Clio settings.", {
              deploymentMessage:
                "The Clio settings page reached the wrong API target. Verify the mounted web build and the active API URL.",
            })
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [canManage, checked]);

  const clioIntegration = useMemo(() => {
    const items = [...(statusPayload?.integrations ?? [])]
      .filter((integration) => integration.provider === "CLIO" && integration.type === "CASE_API")
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return items[0] ?? null;
  }, [statusPayload]);

  const clioConnection = useMemo(() => {
    const items = [...(healthPayload?.connections ?? [])]
      .filter((connection) => connection.provider === "CLIO" && connection.type === "CASE_API")
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return items[0] ?? null;
  }, [healthPayload]);

  const connectionState = useMemo(() => {
    if (!clioIntegration) {
      return {
        label: "Not connected",
        tone: "disconnected",
        description: "No active Clio case-management connection is configured for this firm.",
      };
    }

    if (clioIntegration.status === "CONNECTED") {
      return {
        label: "Connected",
        tone: "connected",
        description: "Clio credentials are stored and available for case sync actions.",
      };
    }

    if (clioIntegration.status === "ERROR") {
      return {
        label: "Needs attention",
        tone: "warning",
        description: "The saved Clio connection is reporting an error and should be retested.",
      };
    }

    return {
      label: "Disconnected",
      tone: "disconnected",
      description: "A prior Clio integration exists, but it is not currently active.",
    };
  }, [clioIntegration]);

  const settingsDirty =
    draftSettings.clioDefaultAllowDocumentUpload !== savedSettings.clioDefaultAllowDocumentUpload ||
    draftSettings.clioDefaultAllowMatterNotes !== savedSettings.clioDefaultAllowMatterNotes ||
    draftSettings.clioDefaultAllowClaimNumberSync !== savedSettings.clioDefaultAllowClaimNumberSync ||
    draftSettings.clioConnectedAccountLabel !== savedSettings.clioConnectedAccountLabel;

  async function saveDefaults() {
    const base = getApiBase();
    if (!base) {
      setError("Missing API base URL.");
      return;
    }
    setSavingDefaults(true);
    setError(null);
    try {
      const response = await fetch(`${base}/me/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        } as HeadersInit,
        body: JSON.stringify(draftSettings),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as ClioSettingsPayload;
      if (!response.ok) {
        throw new Error("Failed to save Clio defaults.");
      }
      const normalized = normalizeClioDefaults(data);
      setSavedSettings(normalized);
      setDraftSettings(normalized);
      setFlash("Clio defaults saved.");
      setTimeout(() => setFlash(null), 3000);
    } catch (saveError) {
      setError(
        formatApiClientError(saveError, "Failed to save Clio defaults.", {
          deploymentMessage:
            "The Clio settings save hit the wrong API target. Verify the active web build and API URL.",
        })
      );
    } finally {
      setSavingDefaults(false);
    }
  }

  async function runConnectionTest() {
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
        formatApiClientError(testError, "Failed to test the Clio connection.", {
          deploymentMessage:
            "The Clio test route reached the wrong API target. Verify the active API URL and web build.",
        })
      );
    } finally {
      setTesting(false);
    }
  }

  async function disconnectIntegration() {
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
        throw new Error(data.error || "Disconnect failed.");
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
      setHealthPayload((current) =>
        current
          ? {
              ...current,
              connections: (current.connections ?? []).map((connection) =>
                connection.id === clioIntegration.id ? { ...connection, status: "DISCONNECTED" } : connection
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
            "The Clio disconnect route reached the wrong API target. Verify the active API URL and web build.",
        })
      );
    } finally {
      setDisconnecting(false);
    }
  }

  if (checked && !canManage) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can manage Clio settings.
          </p>
          <Link href="/dashboard/settings" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Clio Integration" }]}
        title="Clio Integration"
        description="Review the current Clio connection, run admin actions, and save default Clio permissions for staff workflows."
        action={
          <Link href="/dashboard/integrations/setup" className="onyx-btn-primary" style={{ textDecoration: "none" }}>
            Connect to Clio
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
        <DashboardCard title="Connection status">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading Clio status...</p>
          ) : (
            <>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.2rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  ...badgeStyles[connectionState.tone],
                }}
              >
                {connectionState.label}
              </div>
              <p style={{ margin: "0.9rem 0 0", fontSize: "0.9rem", lineHeight: 1.6 }}>
                {connectionState.description}
              </p>
              <dl style={{ margin: "1rem 0 0", display: "grid", gap: "0.75rem" }}>
                <div>
                  <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                    Connected account
                  </dt>
                  <dd style={{ margin: "0.2rem 0 0", fontSize: "0.875rem" }}>
                    {draftSettings.clioConnectedAccountLabel.trim()
                      ? draftSettings.clioConnectedAccountLabel
                      : "Not exposed by the current Clio status API"}
                  </dd>
                </div>
                <div>
                  <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                    Provider record
                  </dt>
                  <dd style={{ margin: "0.2rem 0 0", fontSize: "0.875rem" }}>
                    {clioIntegration ? `${clioIntegration.provider} (${clioIntegration.id})` : "No Clio integration saved"}
                  </dd>
                </div>
                <div>
                  <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                    Last sync / health update
                  </dt>
                  <dd style={{ margin: "0.2rem 0 0", fontSize: "0.875rem" }}>
                    {formatTimestamp(clioConnection?.updatedAt ?? healthPayload?.lastSyncAt)}
                  </dd>
                </div>
                <div>
                  <dt style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
                    Errors in last 24 hours
                  </dt>
                  <dd style={{ margin: "0.2rem 0 0", fontSize: "0.875rem" }}>
                    {healthPayload?.errorCountLast24h ?? 0}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </DashboardCard>

        <DashboardCard title="Admin controls">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.6 }}>
            Use the live setup flow to connect Clio. When a connection already exists, you can verify or disconnect it here without changing other integrations.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link href="/dashboard/integrations/setup" className="onyx-btn-primary" style={{ textDecoration: "none" }}>
              {clioIntegration ? "Reconnect Clio" : "Connect to Clio"}
            </Link>
            <button
              type="button"
              className="onyx-btn-secondary"
              onClick={() => void runConnectionTest()}
              disabled={!clioIntegration || testing}
            >
              {testing ? "Testing..." : "Run test"}
            </button>
            <button
              type="button"
              className="onyx-btn-secondary"
              onClick={() => void disconnectIntegration()}
              disabled={!clioIntegration || disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
          <p style={{ margin: "0.85rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            Account labels are only shown if your firm has already saved one in settings. The current integrations API does not expose the upstream Clio user or email.
          </p>
        </DashboardCard>
      </div>

      <DashboardCard title="Default staff Clio permissions" style={{ marginTop: "1rem" }}>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.6 }}>
          Save the firm defaults staff should start with when they use Clio-connected workflows. These values are stored in firm settings and can be adjusted any time.
        </p>
        <div style={{ display: "grid", gap: "0.85rem" }}>
          {[
            {
              key: "clioDefaultAllowDocumentUpload" as const,
              label: "Allow Clio document uploads by default",
              description: "New Clio-connected workflows start with document upload enabled.",
            },
            {
              key: "clioDefaultAllowMatterNotes" as const,
              label: "Allow Clio matter notes by default",
              description: "Write-back flows default to adding matter notes unless staff opt out.",
            },
            {
              key: "clioDefaultAllowClaimNumberSync" as const,
              label: "Allow claim number sync by default",
              description: "Claim number updates start enabled when the Clio workflow supports them.",
            },
          ].map((item) => (
            <label
              key={item.key}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.85rem",
                padding: "0.85rem 1rem",
                border: "1px solid var(--onyx-border)",
                borderRadius: "var(--onyx-radius-md)",
              }}
            >
              <input
                type="checkbox"
                checked={draftSettings[item.key]}
                onChange={(event) =>
                  setDraftSettings((current) => ({ ...current, [item.key]: event.target.checked }))
                }
                style={{ marginTop: "0.2rem" }}
              />
              <span>
                <strong style={{ display: "block", fontSize: "0.9rem" }}>{item.label}</strong>
                <span style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
                  {item.description}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
            Connected account label
          </label>
          <input
            type="text"
            value={draftSettings.clioConnectedAccountLabel}
            onChange={(event) =>
              setDraftSettings((current) => ({
                ...current,
                clioConnectedAccountLabel: event.target.value,
              }))
            }
            placeholder="Optional label for the connected Clio account"
            style={{
              width: "100%",
              marginTop: "0.45rem",
              padding: "0.75rem 0.85rem",
              borderRadius: "var(--onyx-radius-md)",
              border: "1px solid var(--onyx-border)",
              background: "var(--onyx-surface-elevated)",
              color: "var(--onyx-text)",
            }}
          />
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            Use this if you want operators to see a human-friendly account label even though the current API does not return the upstream Clio user.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <button
            type="button"
            className="onyx-btn-primary"
            onClick={() => void saveDefaults()}
            disabled={!settingsDirty || savingDefaults}
          >
            {savingDefaults ? "Saving..." : "Save defaults"}
          </button>
          <button
            type="button"
            className="onyx-btn-secondary"
            onClick={() => setDraftSettings(savedSettings)}
            disabled={!settingsDirty || savingDefaults}
          >
            Reset changes
          </button>
        </div>
      </DashboardCard>
    </div>
  );
}
