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
import { useDashboardAuth, canAccessBilling } from "@/contexts/DashboardAuthContext";

type BillingStatusResponse = {
  ok?: boolean;
  firm?: {
    name: string;
    plan: string;
    billingStatus: string;
    trialEndsAt: string | null;
    pageLimitMonthly: number;
    retentionDays: number;
  };
  plan?: {
    documentLimitMonthly: number;
    aiIncludedMonthlyUsdEffective: number;
    includedFirmsEffective: number;
    slug?: string;
  };
  usage?: {
    docsProcessed: number;
    aiExecutedCostUsd: number;
    currentFirmCount: number;
  };
  enforcement?: {
    documents: { included: number; used: number; overageUnits: number };
    ai: { included: number; used: number; overageUnits: number };
    firms: { included: number; used: number; overageUnits: number };
    totalOverageDollars: number;
    softCapReached: boolean;
  };
};

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export default function SettingsBillingPage() {
  const { role, checked } = useDashboardAuth();
  const [data, setData] = useState<BillingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !canAccessBilling(role)) return;

    const base = getApiBase();
    fetch(`${base}/billing/status`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as BillingStatusResponse;
        if (!payload.ok || !payload.firm || !payload.plan || !payload.usage || !payload.enforcement) {
          throw new Error("Billing status is unavailable.");
        }
        setData(payload);
        setError(null);
      })
      .catch((requestError) => {
        setError(
          formatApiClientError(
            requestError,
            "We couldn't load billing status.",
            {
              deploymentMessage:
                "The billing status endpoint returned HTML instead of JSON. Check the active API host and whether web or API is serving an older build.",
            }
          )
        );
      })
      .finally(() => setLoading(false));
  }, [checked, role]);

  const documentUsage = useMemo(() => {
    if (!data?.enforcement?.documents) return null;
    return `${data.enforcement.documents.used} of ${data.enforcement.documents.included} documents`;
  }, [data]);

  if (checked && !canAccessBilling(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <ErrorNotice
          tone="warning"
          title="Access restricted"
          message="Only owners and admins can view billing."
          action={
            <Link href="/dashboard/settings" style={{ textDecoration: "none" }}>
              <button type="button" className="onyx-btn-secondary">Back to settings</button>
            </Link>
          }
          style={{ maxWidth: 520, margin: "0 auto" }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Billing" }]}
        title="Billing"
        description="Live plan, usage, and overage status from the firm billing snapshot."
      />

      {error ? (
        <ErrorNotice
          message={error}
          action={
            <button type="button" onClick={() => window.location.reload()} className="onyx-btn-secondary">
              Reload billing
            </button>
          }
          style={{ marginBottom: "1rem" }}
        />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <DashboardCard title="Plan">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading…</p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem" }}>
              <p style={{ margin: 0 }}><strong>Firm:</strong> {data?.firm?.name ?? "—"}</p>
              <p style={{ margin: 0 }}><strong>Plan:</strong> {data?.firm?.plan ?? data?.plan?.slug ?? "—"}</p>
              <p style={{ margin: 0 }}><strong>Billing status:</strong> {data?.firm?.billingStatus ?? "—"}</p>
              <p style={{ margin: 0 }}><strong>Trial ends:</strong> {data?.firm?.trialEndsAt ? new Date(data.firm.trialEndsAt).toLocaleDateString() : "—"}</p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Documents">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading…</p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>{documentUsage ?? "—"}</p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Monthly limit {data?.plan?.documentLimitMonthly ?? data?.firm?.pageLimitMonthly ?? 0}
              </p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Overage docs: {data?.enforcement?.documents.overageUnits ?? 0}
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="AI usage">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading…</p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>
                {formatUsd(data?.usage?.aiExecutedCostUsd)}
              </p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Included: {formatUsd(data?.plan?.aiIncludedMonthlyUsdEffective)}
              </p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Overage units: {data?.enforcement?.ai.overageUnits ?? 0}
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Firm access">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading…</p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>
                {data?.usage?.currentFirmCount ?? 0} / {data?.plan?.includedFirmsEffective ?? 0}
              </p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Retention: {data?.firm?.retentionDays ?? 0} days
              </p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Total overage: {formatUsd(data?.enforcement?.totalOverageDollars)}
              </p>
            </div>
          )}
        </DashboardCard>
      </div>

      {data?.enforcement?.softCapReached ? (
        <ErrorNotice
          tone="warning"
          title="Usage warning"
          message="One or more billing meters have crossed the soft cap. Review document, AI, and firm usage before month end."
        />
      ) : null}
    </div>
  );
}
