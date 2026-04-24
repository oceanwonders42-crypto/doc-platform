"use client";

import { useState } from "react";
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
import { canAccessFirmSettings, useDashboardAuth } from "@/contexts/DashboardAuthContext";

type ApiKeyResponse = {
  ok?: boolean;
  apiKey?: string;
  keyPrefix?: string;
  id?: string;
  message?: string;
  error?: string;
};

export default function SettingsApiKeysPage() {
  const { checked, role, firm } = useDashboardAuth();
  const [keyName, setKeyName] = useState("Dashboard ingest key");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<ApiKeyResponse | null>(null);

  async function createKey() {
    if (!firm?.id) {
      setError("Firm context is missing.");
      return;
    }
    const base = getApiBase();
    if (!base) {
      setError("Missing API base URL.");
      return;
    }
    setLoading(true);
    setError(null);
    setCreatedKey(null);
    try {
      const response = await fetch(`${base}/firms/${encodeURIComponent(firm.id)}/api-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        } as HeadersInit,
        body: JSON.stringify({ name: keyName.trim() || "Dashboard ingest key" }),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as ApiKeyResponse;
      if (!response.ok || !data.ok || !data.apiKey) {
        throw new Error(data.error || "Failed to create API key.");
      }
      setCreatedKey(data);
    } catch (createError) {
      setError(
        formatApiClientError(createError, "Failed to create API key.", {
          deploymentMessage:
            "The API key route reached the wrong API target. Verify the active web build and API URL.",
        })
      );
    } finally {
      setLoading(false);
    }
  }

  if (checked && !canAccessFirmSettings(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can create firm API keys.
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
        breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "API Keys" }]}
        title="API Keys"
        description="Create a new firm ingest key when you need to authorize imports or automation outside the dashboard."
      />

      {error && (
        <div
          className="onyx-card"
          style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}
        >
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{error}</p>
        </div>
      )}

      <DashboardCard title="Create a new ingest key">
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.6 }}>
          Keys are shown once. Save the new value immediately and rotate old keys as needed.
        </p>
        <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, color: "var(--onyx-text-muted)" }}>
          Key name
        </label>
        <input
          type="text"
          value={keyName}
          onChange={(event) => setKeyName(event.target.value)}
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

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <button type="button" className="onyx-btn-primary" onClick={() => void createKey()} disabled={loading}>
            {loading ? "Creating..." : "Create ingest key"}
          </button>
          <Link href="/dashboard/settings" className="onyx-btn-secondary" style={{ textDecoration: "none" }}>
            Back to settings
          </Link>
        </div>
      </DashboardCard>

      {createdKey?.apiKey && (
        <DashboardCard title="New key" style={{ marginTop: "1rem" }}>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            {createdKey.message || "Save this key now. It will not be shown again."}
          </p>
          <div
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "var(--onyx-radius-md)",
              background: "var(--onyx-surface-elevated)",
              border: "1px solid var(--onyx-border)",
              fontFamily: "var(--onyx-font-mono)",
              fontSize: "0.875rem",
              overflowWrap: "anywhere",
            }}
          >
            {createdKey.apiKey}
          </div>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            Prefix: {createdKey.keyPrefix ?? "n/a"}
          </p>
        </DashboardCard>
      )}
    </div>
  );
}
