"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { useDashboardAuth, canAccessBilling } from "@/contexts/DashboardAuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type BillingData = {
  plan?: string;
  status?: string;
  subscriptionStatus?: string;
  billingEmail?: string;
  stripeCustomerId?: string;
};

export default function SettingsBillingPage() {
  const { role, checked } = useDashboardAuth();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [firmName, setFirmName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!checked || !canAccessBilling(role)) return;
    const base = getApiBase();
    if (!base) return;
    fetch(`${base}/me/billing`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => (res.ok ? parseJsonResponse(res) : null))
      .then((data: unknown) => {
        const payload = data as { ok?: boolean; billing?: BillingData; firmName?: string };
        if (payload?.ok) {
          setBilling(payload.billing ?? null);
          setFirmName(payload.firmName ?? "");
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [checked, role]);

  if (checked && !canAccessBilling(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can view billing.
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
        breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Billing" }]}
        title="Billing"
        description="Plan and subscription details for your firm."
      />

      <DashboardCard title="Subscription">
        {loading ? (
          <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
        ) : billing ? (
          <dl style={{ margin: 0, display: "grid", gap: "0.75rem" }}>
            <div>
              <dt style={{ fontSize: "var(--onyx-dash-font-xs)", color: "var(--onyx-text-muted)", marginBottom: 2 }}>Firm</dt>
              <dd style={{ margin: 0 }}>{firmName}</dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--onyx-dash-font-xs)", color: "var(--onyx-text-muted)", marginBottom: 2 }}>Plan</dt>
              <dd style={{ margin: 0 }}>{billing.plan ?? "—"}</dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--onyx-dash-font-xs)", color: "var(--onyx-text-muted)", marginBottom: 2 }}>Status</dt>
              <dd style={{ margin: 0 }}>{billing.status ?? billing.subscriptionStatus ?? "—"}</dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--onyx-dash-font-xs)", color: "var(--onyx-text-muted)", marginBottom: 2 }}>Billing email</dt>
              <dd style={{ margin: 0 }}>{billing.billingEmail ?? "—"}</dd>
            </div>
            {billing.stripeCustomerId && (
              <div>
                <dt style={{ fontSize: "var(--onyx-dash-font-xs)", color: "var(--onyx-text-muted)", marginBottom: 2 }}>Stripe customer</dt>
                <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "var(--onyx-dash-font-sm)" }}>{billing.stripeCustomerId}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p style={{ color: "var(--onyx-text-muted)" }}>No billing data.</p>
        )}
      </DashboardCard>
    </div>
  );
}
