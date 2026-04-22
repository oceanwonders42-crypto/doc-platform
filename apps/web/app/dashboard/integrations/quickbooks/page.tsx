"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { canAccessIntegrations, useDashboardAuth } from "@/contexts/DashboardAuthContext";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

type QuickbooksConnectionStatus = {
  envConfigured: boolean;
  missingEnvVars: string[];
  connected: boolean;
  integrationId: string | null;
  status: string | null;
  realmId: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
  connectedByUserId: string | null;
};

type QuickbooksInvoiceSyncItem = {
  id: string;
  sourceSystem: string;
  sourceOrderId: string;
  sourceOrderNumber: string;
  billingEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  totalAmount: string;
  currency: string;
  invoiceStatus: string;
  qboCustomerId: string | null;
  qboInvoiceId: string | null;
  qboInvoiceDocNumber: string | null;
  invoiceEmailedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
  customerFacingPreview: {
    brandLabel: string;
    lineDescription: string;
  };
};

type QuickbooksOpsResponse = {
  ok?: boolean;
  connection?: QuickbooksConnectionStatus;
  envStatus?: { configured: boolean; missingEnvVars: string[] };
  items?: QuickbooksInvoiceSyncItem[];
  error?: string;
};

function isQuickbooksOpsResponse(data: unknown): data is QuickbooksOpsResponse {
  return typeof data === "object" && data !== null;
}

export default function QuickbooksPage() {
  const { role, checked } = useDashboardAuth();
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<QuickbooksConnectionStatus | null>(null);
  const [items, setItems] = useState<QuickbooksInvoiceSyncItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const callbackStatus = searchParams.get("status");
  const callbackMessage = searchParams.get("message");

  const loadOps = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${getApiBase()}/me/quickbooks/invoice-syncs?limit=25`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((data: unknown) => {
        if (isQuickbooksOpsResponse(data) && data.ok && data.connection) {
          setConnection(data.connection);
          setItems(data.items ?? []);
          setError(null);
        } else {
          setError("We couldn't load QuickBooks invoicing status. Please try again.");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "We couldn't load QuickBooks invoicing status.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOps();
  }, [loadOps]);

  useEffect(() => {
    if (callbackStatus === "success") {
      setActionMessage("QuickBooks connection updated successfully.");
      setActionError(null);
    } else if (callbackStatus === "error" && callbackMessage) {
      setActionError(callbackMessage);
      setActionMessage(null);
    }
  }, [callbackMessage, callbackStatus]);

  const customerFacingPreview = useMemo(() => {
    return items[0]?.customerFacingPreview ?? { brandLabel: "OnyxIntel", lineDescription: "OnyxIntel invoice" };
  }, [items]);

  async function connectQuickbooks() {
    setConnecting(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`${getApiBase()}/integrations/quickbooks/connect`, {
        method: "GET",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as { ok?: boolean; authorizeUrl?: string; error?: string };
      if (!response.ok || !data.ok || !data.authorizeUrl) {
        throw new Error(data.error ?? `QuickBooks connect failed (${response.status}).`);
      }
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start QuickBooks OAuth.");
      setConnecting(false);
    }
  }

  async function resendInvoice(syncId: string) {
    setResendingId(syncId);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`${getApiBase()}/me/quickbooks/invoice-syncs/${syncId}/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({}),
      });
      const data = (await parseJsonResponse(response)) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? `Resend failed (${response.status}).`);
      }
      setActionMessage("QuickBooks invoice email resent.");
      await loadOps();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to resend QuickBooks invoice.");
    } finally {
      setResendingId(null);
    }
  }

  const columns: Column<QuickbooksInvoiceSyncItem>[] = [
    {
      key: "order",
      header: "Source order",
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontWeight: 600 }}>{row.sourceOrderNumber}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>{row.sourceSystem} / {row.sourceOrderId}</span>
        </div>
      ),
    },
    {
      key: "billing",
      header: "Billing",
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span>{row.billingEmail ?? "Missing email"}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
            {[row.customerFirstName, row.customerLastName].filter(Boolean).join(" ") || "No customer name"}
          </span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => `${row.currency} ${row.totalAmount}`,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span className="onyx-badge onyx-badge-neutral">{row.invoiceStatus}</span>
          {row.invoiceEmailedAt ? (
            <span style={{ fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
              Emailed {new Date(row.invoiceEmailedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "qbo",
      header: "QuickBooks",
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.8125rem" }}>Customer: {row.qboCustomerId ?? "N/A"}</span>
          <span style={{ fontSize: "0.8125rem" }}>Invoice: {row.qboInvoiceId ?? "N/A"}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Doc #: {row.qboInvoiceDocNumber ?? "N/A"}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", alignItems: "flex-start" }}>
          <button
            type="button"
            className="onyx-link"
            disabled={!row.qboInvoiceId || resendingId === row.id}
            onClick={() => resendInvoice(row.id)}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              cursor: !row.qboInvoiceId || resendingId === row.id ? "not-allowed" : "pointer",
              opacity: !row.qboInvoiceId || resendingId === row.id ? 0.55 : 1,
            }}
          >
            {resendingId === row.id ? "Resending..." : "Resend invoice"}
          </button>
          {row.lastSyncError ? (
            <span style={{ fontSize: "0.75rem", color: "var(--onyx-error)", maxWidth: 240 }}>{row.lastSyncError}</span>
          ) : null}
        </div>
      ),
    },
  ];

  if (checked && !canAccessIntegrations(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can manage QuickBooks invoicing.
          </p>
          <Link href="/dashboard/integrations" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to integrations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Integrations", href: "/dashboard/integrations" },
          { label: "QuickBooks invoicing" },
        ]}
        title="QuickBooks invoicing"
        description="OnyxIntel QuickBooks connection and invoice sync status."
        action={
          <button
            type="button"
            className="onyx-btn-primary"
            onClick={connectQuickbooks}
            disabled={connecting || loading || connection?.envConfigured === false}
          >
            {connecting ? "Connecting..." : connection?.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
          </button>
        }
      />

      {actionError ? (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{actionError}</p>
        </div>
      ) : null}

      {actionMessage ? (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-success)" }}>
          <p style={{ margin: 0, color: "var(--onyx-success)", fontSize: "0.875rem" }}>{actionMessage}</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <DashboardCard title="Connection status">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>Loading...</p>
          ) : connection ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>
              <span>
                Status:{" "}
                <span className="onyx-badge onyx-badge-neutral">
                  {connection.connected ? "CONNECTED" : connection.status ?? "NOT_CONNECTED"}
                </span>
              </span>
              <span>Realm ID: {connection.realmId ?? "Not connected"}</span>
              <span>Connected at: {connection.connectedAt ? new Date(connection.connectedAt).toLocaleString() : "N/A"}</span>
              <span>Last updated: {connection.updatedAt ? new Date(connection.updatedAt).toLocaleString() : "N/A"}</span>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>No QuickBooks connection loaded.</p>
          )}
        </DashboardCard>

        <DashboardCard title="Customer-facing invoice rules">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>
            <span>Brand label: {customerFacingPreview.brandLabel}</span>
            <span>Neutral line description: {customerFacingPreview.lineDescription}</span>
            <span style={{ color: "var(--onyx-text-muted)" }}>
              Source order numbers, raw item titles, product details, and source branding are kept internal only.
            </span>
          </div>
        </DashboardCard>

        <DashboardCard title="Environment readiness">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>Loading...</p>
          ) : connection?.envConfigured === false ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>
              <span style={{ color: "var(--onyx-error)" }}>QuickBooks env is incomplete.</span>
              <span style={{ color: "var(--onyx-text-muted)" }}>
                Missing: {connection.missingEnvVars.length > 0 ? connection.missingEnvVars.join(", ") : "Unknown vars"}
              </span>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
              QuickBooks env vars are configured for this runtime.
            </p>
          )}
        </DashboardCard>
      </div>

      <DashboardCard title="Recent sanitized order syncs" style={{ marginTop: "1rem" }}>
        {loading ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>Loading...</p>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{error}</p>
            <button type="button" className="onyx-link" onClick={loadOps} style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
              Try again
            </button>
          </div>
        ) : (
          <DataTable columns={columns} data={items} emptyMessage="No sanitized order syncs yet." />
        )}
      </DashboardCard>
    </div>
  );
}
