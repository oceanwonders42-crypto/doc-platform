"use client";

import { useState } from "react";

const FEATURE_LABELS = [
  ["exports_enabled", "Exports"],
  ["migration_batch_enabled", "Migration Batch"],
  ["traffic_enabled", "Traffic"],
  ["providers_enabled", "Providers"],
  ["providers_map_enabled", "Providers Map"],
  ["case_qa_enabled", "Case Q&A"],
  ["missing_records_enabled", "Missing Records"],
  ["bills_vs_treatment_enabled", "Bills vs Treatment"],
  ["demand_drafts_enabled", "Demand Drafts"],
  ["demand_audit_enabled", "Demand Audit"],
] as const;

export function UpdateFirmForm({
  firmId,
  initialPlan,
  initialPageLimit,
  initialStatus,
  initialFeatureOverrides,
}: {
  firmId: string;
  initialPlan: string;
  initialPageLimit: number;
  initialStatus: string;
  initialFeatureOverrides: Record<string, boolean>;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [pageLimitMonthly, setPageLimitMonthly] = useState(String(initialPageLimit));
  const [status, setStatus] = useState(initialStatus);
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, boolean>>(initialFeatureOverrides);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
          pageLimitMonthly: parseInt(pageLimitMonthly, 10) || 0,
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
        marginTop: 16,
        padding: 16,
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: 12,
      }}
    >
      <div>
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>Plan</label>
        <input
          type="text"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, width: 120 }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>Page limit (monthly)</label>
        <input
          type="number"
          min={0}
          value={pageLimitMonthly}
          onChange={(e) => setPageLimitMonthly(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, width: 100 }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, minWidth: 100 }}
        >
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="cancelled">cancelled</option>
        </select>
      </div>
      <div style={{ flexBasis: "100%" }}>
        <div style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 8 }}>
          Developer-controlled feature access
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {FEATURE_LABELS.map(([key, label]) => (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={featureOverrides[key] === true}
                onChange={(event) =>
                  setFeatureOverrides((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#666" }}>
          These overrides control firm access in addition to plan/tier rules and are enforced by the API.
        </p>
      </div>
      <button
        type="submit"
        disabled={saving}
        style={{
          padding: "8px 16px",
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving…" : "Update firm"}
      </button>
      {message && (
        <span style={{ color: message.ok ? "#2e7d32" : "#c00", fontSize: 14 }}>{message.text}</span>
      )}
    </form>
  );
}
