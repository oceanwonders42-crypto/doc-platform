"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { useDashboardAuth, canAccessFirmSettings } from "@/contexts/DashboardAuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type FirmSettings = {
  id: string;
  name: string;
  billingEmail: string | null;
  plan?: string;
  pageLimitMonthly?: number;
  retentionDays?: number;
  settings?: unknown;
};

export default function FirmSettingsPage() {
  const { role, checked } = useDashboardAuth();
  const [firm, setFirm] = useState<FirmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !canAccessFirmSettings(role)) return;
    const base = getApiBase();
    if (!base) return;
    fetch(`${base}/me/firm/settings`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => (res.ok ? parseJsonResponse(res) : null))
      .then((data: unknown) => {
        const d = data as { ok?: boolean; firm?: FirmSettings };
        if (d?.ok && d.firm) {
          setFirm(d.firm);
          setName(d.firm.name);
          setBillingEmail(d.firm.billingEmail ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [checked, role]);

  if (checked && !canAccessFirmSettings(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can edit firm settings.
          </p>
          <Link href="/dashboard" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const base = getApiBase();
    if (!base) {
      setError("API not configured");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`${base}/me/firm/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name: name.trim(), billingEmail: billingEmail.trim() || undefined }),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) setFirm((f) => (f ? { ...f, name: name.trim(), billingEmail: billingEmail.trim() || null } : null));
      else setError(data.error ?? "Save failed");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }, { label: "Firm settings" }]}
        title="Firm settings"
        description="Manage your firm name and billing contact."
      />

      <DashboardCard title="Firm details">
        {loading ? (
          <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
        ) : (
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label htmlFor="firm-name" style={{ display: "block", marginBottom: "0.25rem", fontSize: "var(--onyx-dash-font-sm)" }}>
                Firm name
              </label>
              <input
                id="firm-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="firm-billing-email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "var(--onyx-dash-font-sm)" }}>
                Billing email
              </label>
              <input
                id="firm-billing-email"
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
                placeholder="billing@firm.com"
              />
            </div>
            {error && <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "var(--onyx-dash-font-sm)" }}>{error}</p>}
            <button type="submit" disabled={saving} className="onyx-btn-primary" style={{ alignSelf: "flex-start" }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </DashboardCard>
    </div>
  );
}
