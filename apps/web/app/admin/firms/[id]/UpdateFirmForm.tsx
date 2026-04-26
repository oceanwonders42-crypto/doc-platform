"use client";

import { useMemo, useState } from "react";

const FEATURE_LABELS = [
  ["exports_enabled", "Exports", "Controlled CRM/export handoff surfaces", "Admin"],
  ["migration_batch_enabled", "Migration Batch", "Legacy batch migration controls", "Admin"],
  ["traffic_enabled", "Traffic", "Traffic and intake monitoring", "Admin"],
  ["providers_enabled", "Providers", "Provider directory management", "Provider"],
  ["providers_map_enabled", "Providers Map", "Map-based provider lookup", "Provider"],
  ["case_qa_enabled", "Case Q&A", "Case-grounded assistant answers", "AI"],
  ["missing_records_enabled", "Missing Records", "Gap analysis from case evidence", "AI"],
  ["bills_vs_treatment_enabled", "Bills vs Treatment", "Billing/treatment comparison", "AI"],
  ["demand_drafts_enabled", "Demand Drafts", "Review-ready demand drafts", "Demand"],
  ["demand_audit_enabled", "Demand Audit", "Firm-admin demand review lane", "Demand"],
] as const;

export function UpdateFirmForm({
  firmId,
  initialPlan,
  initialBillingStatus,
  initialPageLimit,
  initialSeatLimit,
  initialDemandLimit,
  initialStatus,
  initialFeatureOverrides,
}: {
  firmId: string;
  initialPlan: string;
  initialBillingStatus: string;
  initialPageLimit: number;
  initialSeatLimit: number;
  initialDemandLimit: number;
  initialStatus: string;
  initialFeatureOverrides: Record<string, boolean>;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [billingStatus, setBillingStatus] = useState(initialBillingStatus);
  const [pageLimitMonthly, setPageLimitMonthly] = useState(String(initialPageLimit));
  const [seatLimit, setSeatLimit] = useState(String(initialSeatLimit));
  const [demandLimitMonthly, setDemandLimitMonthly] = useState(String(initialDemandLimit));
  const [status, setStatus] = useState(initialStatus);
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, boolean>>(initialFeatureOverrides);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const enabledCount = useMemo(
    () => FEATURE_LABELS.filter(([key]) => featureOverrides[key] === true).length,
    [featureOverrides]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/firms/${firmId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: plan.trim(),
          billingStatus: billingStatus.trim(),
          pageLimitMonthly: parseInt(pageLimitMonthly, 10) || 0,
          seatLimit: parseInt(seatLimit, 10) || 0,
          demandLimitMonthly: parseInt(demandLimitMonthly, 10) || 0,
          status: status.trim(),
          featureOverrides,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: "Updated." });
      } else {
        setMessage({ ok: false, text: data?.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: 20,
        padding: 20,
        border: "1px solid #d9e2ec",
        borderRadius: 18,
        background: "linear-gradient(180deg, #ffffff, #f8fafc)",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)",
        display: "grid",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#64748b",
            }}
          >
            Developer firm controls
          </p>
          <h2 style={{ margin: "6px 0 0", fontSize: 20, lineHeight: 1.1 }}>
            Plan, limits, and feature visibility
          </h2>
          <p style={{ margin: "8px 0 0", maxWidth: 620, color: "#475569", fontSize: 14, lineHeight: 1.55 }}>
            These switches decide what this firm can see after role and plan checks. Hidden features stay out of normal navigation.
          </p>
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            padding: "8px 12px",
            color: "#0f172a",
            background: "#f8fafc",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {enabledCount}/{FEATURE_LABELS.length} enabled
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>Plan</label>
          <input
            type="text"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>Billing status</label>
          <select
            value={billingStatus}
            onChange={(e) => setBillingStatus(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, width: "100%" }}
          >
            <option value="trial">trial</option>
            <option value="active">active</option>
            <option value="past_due">past_due</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>Page limit (monthly)</label>
          <input
            type="number"
            min={0}
            value={pageLimitMonthly}
            onChange={(e) => setPageLimitMonthly(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>Seat limit</label>
          <input
            type="number"
            min={0}
            value={seatLimit}
            onChange={(e) => setSeatLimit(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>Demand limit (monthly)</label>
          <input
            type="number"
            min={0}
            value={demandLimitMonthly}
            onChange={(e) => setDemandLimitMonthly(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, width: "100%" }}
          >
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
      </div>

      <div>
        <div style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Feature visibility
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {FEATURE_LABELS.map(([key, label, description, group]) => {
            const checked = featureOverrides[key] === true;
            return (
              <label
                key={key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  alignItems: "start",
                  gap: 10,
                  padding: "12px",
                  border: `1px solid ${checked ? "#86efac" : "#e2e8f0"}`,
                  borderRadius: 14,
                  background: checked ? "#f0fdf4" : "#ffffff",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    setFeatureOverrides((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                  style={{ marginTop: 3 }}
                />
                <span style={{ display: "grid", gap: 4 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{label}</strong>
                    <span style={{ color: checked ? "#166534" : "#64748b", fontSize: 11, fontWeight: 800 }}>
                      {checked ? "VISIBLE" : "HIDDEN"}
                    </span>
                  </span>
                  <span style={{ color: "#64748b", lineHeight: 1.45 }}>{description}</span>
                  <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>{group} lane</span>
                </span>
              </label>
            );
          })}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>
          These overrides control firm access in addition to plan/tier rules and are enforced by the API.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 18px",
            background: "#0f172a",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
            fontWeight: 700,
          }}
        >
          {saving ? "Saving..." : "Update firm"}
        </button>
        {message && (
          <span style={{ color: message.ok ? "#166534" : "#b91c1c", fontSize: 14, fontWeight: 700 }}>{message.text}</span>
        )}
      </div>
    </form>
  );
}
