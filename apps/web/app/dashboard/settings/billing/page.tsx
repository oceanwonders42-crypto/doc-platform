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

type Meter = {
  included: number;
  used: number;
  overageUnits: number;
  remainingIncluded?: number | null;
  status?: string;
  softCapReached?: boolean;
};

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
    name?: string;
    slug?: string;
    priceMonthlyDollars?: number;
    priceOneTimeDollars?: number | null;
    documentLimitMonthly: number;
    seatLimitEffective?: number;
    demandLimitMonthlyEffective?: number;
    aiIncludedMonthlyUsdEffective: number;
    includedFirmsEffective: number;
    includedFeatures?: string[];
    integrations?: { gmail?: boolean; clio?: boolean };
  };
  usage?: {
    docsProcessed: number;
    demandPackagesCreated?: number;
    activeUserCount?: number;
    pendingInviteCount?: number;
    aiExecutedCostUsd: number;
    currentFirmCount: number;
  };
  enforcement?: {
    documents: Meter;
    users?: Meter;
    demands?: Meter;
    ai: Meter;
    firms: Meter;
    totalOverageDollars: number;
    softCapReached: boolean;
    upgradeMessage?: string | null;
  };
};

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

function formatLimit(meter: Meter | undefined, unlimitedLabel = "Custom"): string {
  if (!meter) return "-";
  if (meter.included <= 0) return `${meter.used} / ${unlimitedLabel}`;
  return `${meter.used} / ${meter.included}`;
}

function featureLabel(featureKey: string): string {
  return featureKey
    .replace(/_enabled$/g, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  const planPrice = useMemo(() => {
    if (!data?.plan) return "-";
    if (typeof data.plan.priceMonthlyDollars === "number" && data.plan.priceMonthlyDollars > 0) {
      return `${formatUsd(data.plan.priceMonthlyDollars)} / mo`;
    }
    if (typeof data.plan.priceOneTimeDollars === "number" && data.plan.priceOneTimeDollars > 0) {
      return `${formatUsd(data.plan.priceOneTimeDollars)} onboarding`;
    }
    return "Custom";
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

  const features = data?.plan?.includedFeatures ?? [];

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Billing" }]}
        title="Billing and plan limits"
        description="Live seats, document usage, demand volume, AI spend, and enabled account capabilities."
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <DashboardCard title="Plan">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem" }}>
              <p style={{ margin: 0 }}><strong>Firm:</strong> {data?.firm?.name ?? "-"}</p>
              <p style={{ margin: 0 }}><strong>Plan:</strong> {data?.plan?.name ?? data?.firm?.plan ?? "-"}</p>
              <p style={{ margin: 0 }}><strong>Price:</strong> {planPrice}</p>
              <p style={{ margin: 0 }}><strong>Billing status:</strong> {data?.firm?.billingStatus ?? "-"}</p>
              <p style={{ margin: 0 }}><strong>Trial ends:</strong> {data?.firm?.trialEndsAt ? new Date(data.firm.trialEndsAt).toLocaleDateString() : "-"}</p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Seats">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800 }}>{formatLimit(data?.enforcement?.users)}</p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                {data?.usage?.activeUserCount ?? 0} active, {data?.usage?.pendingInviteCount ?? 0} pending
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Documents">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800 }}>{formatLimit(data?.enforcement?.documents)}</p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Monthly limit {data?.plan?.documentLimitMonthly ?? data?.firm?.pageLimitMonthly ?? 0}
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Demands">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800 }}>{formatLimit(data?.enforcement?.demands)}</p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Review-ready drafts this month</p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="AI usage">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800 }}>
                {formatUsd(data?.usage?.aiExecutedCostUsd)}
              </p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                Included: {formatUsd(data?.plan?.aiIncludedMonthlyUsdEffective)}
              </p>
            </div>
          )}
        </DashboardCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        <DashboardCard title="Feature access">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : features.length === 0 ? (
            <ErrorNotice tone="info" title="Custom access" message="This plan is managed by developer overrides." />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {features.map((feature) => (
                <span key={feature} className="onyx-badge onyx-badge-success">
                  {featureLabel(feature)}
                </span>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Integrations">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "0.65rem" }}>
              <p style={{ margin: 0 }}>
                Gmail: <strong>{data?.plan?.integrations?.gmail ? "Included" : "Not included"}</strong>
              </p>
              <p style={{ margin: 0 }}>
                Clio: <strong>{data?.plan?.integrations?.clio ? "Included" : "Requires upgrade/override"}</strong>
              </p>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.85rem" }}>
                Developer feature flags can further enable or hide firm-specific access.
              </p>
            </div>
          )}
        </DashboardCard>
      </div>

      {data?.enforcement?.upgradeMessage ? (
        <ErrorNotice
          tone="warning"
          title="Plan limit reached or approaching"
          message={data.enforcement.upgradeMessage}
          style={{ marginTop: "1rem" }}
        />
      ) : null}
    </div>
  );
}
