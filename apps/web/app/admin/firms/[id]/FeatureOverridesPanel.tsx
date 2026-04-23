"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getAuthHeader, getFetchOptions } from "@/lib/api";

type EffectiveFeatureAccess = {
  featureKey: string;
  effectiveEnabled: boolean;
  source: "plan" | "override" | "none" | "entitlement" | "legacy_flag";
  planEnabled: boolean;
  overrideId: string | null;
  overrideEnabled: boolean | null;
  startsAt: string | null;
  endsAt: string | null;
  activeNow: boolean;
  reason: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type FeatureOverride = {
  id: string;
  featureKey: string;
  enabled: boolean;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function sourceLabel(value: EffectiveFeatureAccess["source"]): string {
  if (value === "override") return "Override";
  if (value === "entitlement") return "Plan entitlement";
  if (value === "legacy_flag") return "Legacy fallback";
  if (value === "plan") return "Default";
  return "Disabled";
}

function sourceTone(value: EffectiveFeatureAccess["source"]): {
  background: string;
  color: string;
} {
  if (value === "override") return { background: "#e3f2fd", color: "#0d47a1" };
  if (value === "entitlement") return { background: "#e8f5e9", color: "#1b5e20" };
  if (value === "legacy_flag") return { background: "#fff8e1", color: "#8d6e00" };
  if (value === "plan") return { background: "#f0f4f8", color: "#345" };
  return { background: "#f5f5f5", color: "#666" };
}

export function FeatureOverridesPanel({
  firmId,
  featureKeys,
  effectiveFeatureAccess,
  featureOverrides,
  onChanged,
}: {
  firmId: string;
  featureKeys: string[];
  effectiveFeatureAccess: EffectiveFeatureAccess[];
  featureOverrides: FeatureOverride[];
  onChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [featureKey, setFeatureKey] = useState(featureKeys[0] ?? "crm_sync");
  const [enabled, setEnabled] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingOverrideId, setSavingOverrideId] = useState<string | null>(null);

  const overridesById = useMemo(
    () =>
      Object.fromEntries(
        featureOverrides.map((override) => [
          override.id,
          {
            enabled: override.enabled,
            isActive: override.isActive,
            startsAt: toDateTimeLocalValue(override.startsAt),
            endsAt: toDateTimeLocalValue(override.endsAt),
            reason: override.reason ?? "",
          },
        ])
      ),
    [featureOverrides]
  );
  const [draftOverrides, setDraftOverrides] = useState(overridesById);

  useEffect(() => {
    setDraftOverrides(overridesById);
  }, [overridesById]);

  async function handleCreateOverride(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/firms/${firmId}/feature-overrides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({
          featureKey,
          enabled,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          reason: reason.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setFeatureKey(featureKeys[0] ?? featureKey);
      setEnabled(true);
      setStartsAt("");
      setEndsAt("");
      setReason("");
      setMessage({ ok: true, text: "Override created." });
      if (onChanged) {
        await onChanged();
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveOverride(overrideId: string) {
    const draft = draftOverrides[overrideId];
    if (!draft) return;
    setSavingOverrideId(overrideId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/firms/${firmId}/feature-overrides/${overrideId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({
          enabled: draft.enabled,
          isActive: draft.isActive,
          startsAt: draft.startsAt || null,
          endsAt: draft.endsAt || null,
          reason: draft.reason.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setMessage({ ok: true, text: "Override updated." });
      if (onChanged) {
        await onChanged();
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setSavingOverrideId(null);
    }
  }

  async function handleDisableOverride(overrideId: string) {
    setSavingOverrideId(overrideId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/firms/${firmId}/feature-overrides/${overrideId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({ isActive: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setMessage({ ok: true, text: "Override disabled." });
      if (onChanged) {
        await onChanged();
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setSavingOverrideId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f9f9f9", textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "10px" }}>Feature</th>
              <th style={{ padding: "10px" }}>Effective</th>
              <th style={{ padding: "10px" }}>Source</th>
              <th style={{ padding: "10px" }}>Default</th>
              <th style={{ padding: "10px" }}>Override</th>
              <th style={{ padding: "10px" }}>Window</th>
            </tr>
          </thead>
          <tbody>
            {effectiveFeatureAccess.map((entry) => (
              <tr key={entry.featureKey} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px", fontFamily: "monospace", fontSize: 12 }}>
                  {entry.featureKey}
                </td>
                <td style={{ padding: "10px" }}>{entry.effectiveEnabled ? "Enabled" : "Hidden"}</td>
                <td style={{ padding: "10px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 12,
                      ...sourceTone(entry.source),
                    }}
                  >
                    {sourceLabel(entry.source)}
                  </span>
                </td>
                <td style={{ padding: "10px" }}>{entry.planEnabled ? "Enabled" : "Disabled"}</td>
                <td style={{ padding: "10px" }}>
                  {entry.overrideEnabled == null
                    ? "-"
                    : `${entry.overrideEnabled ? "Enable" : "Disable"}${entry.activeNow ? " (active)" : " (inactive)"}`}
                </td>
                <td style={{ padding: "10px", fontSize: 12, color: "#666" }}>
                  <div>{entry.startsAt ? `Starts ${formatDateTime(entry.startsAt)}` : "No start"}</div>
                  <div>{entry.endsAt ? `Ends ${formatDateTime(entry.endsAt)}` : "No end"}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleCreateOverride}
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Create feature override</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
            Feature
            <select
              value={featureKey}
              onChange={(event) => setFeatureKey(event.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
            >
              {featureKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
            Override action
            <select
              value={enabled ? "enable" : "disable"}
              onChange={(event) => setEnabled(event.target.value === "enable")}
              style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
            >
              <option value="enable">Enable</option>
              <option value="disable">Disable</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
            Starts at
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
            Ends at
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
            />
          </label>
        </div>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
          Reason / notes
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={creating}
            style={{
              padding: "8px 16px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: creating ? "not-allowed" : "pointer",
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? "Saving..." : "Create override"}
          </button>
          {message && (
            <span style={{ color: message.ok ? "#2e7d32" : "#c00", fontSize: 14 }}>
              {message.text}
            </span>
          )}
        </div>
      </form>

      <div style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Override history</h3>
        {featureOverrides.length === 0 ? (
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>No feature overrides yet.</p>
        ) : (
          featureOverrides.map((override) => {
            const draft = draftOverrides[override.id] ?? {
              enabled: override.enabled,
              isActive: override.isActive,
              startsAt: toDateTimeLocalValue(override.startsAt),
              endsAt: toDateTimeLocalValue(override.endsAt),
              reason: override.reason ?? "",
            };

            return (
              <div
                key={override.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  padding: 16,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontFamily: "monospace", fontSize: 13 }}>{override.featureKey}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                      Created {formatDateTime(override.createdAt)} · Updated {formatDateTime(override.updatedAt)}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleSaveOverride(override.id)}
                      disabled={savingOverrideId === override.id}
                      style={{
                        padding: "8px 14px",
                        background: "#111",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: savingOverrideId === override.id ? "not-allowed" : "pointer",
                        opacity: savingOverrideId === override.id ? 0.7 : 1,
                      }}
                    >
                      {savingOverrideId === override.id ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisableOverride(override.id)}
                      disabled={savingOverrideId === override.id || !draft.isActive}
                      style={{
                        padding: "8px 14px",
                        background: "#fff",
                        color: "#111",
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        cursor:
                          savingOverrideId === override.id || !draft.isActive
                            ? "not-allowed"
                            : "pointer",
                        opacity: savingOverrideId === override.id || !draft.isActive ? 0.6 : 1,
                      }}
                    >
                      Disable
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
                    Override action
                    <select
                      value={draft.enabled ? "enable" : "disable"}
                      onChange={(event) =>
                        setDraftOverrides((current) => ({
                          ...current,
                          [override.id]: {
                            ...draft,
                            enabled: event.target.value === "enable",
                          },
                        }))
                      }
                      style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
                    >
                      <option value="enable">Enable</option>
                      <option value="disable">Disable</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
                    Active
                    <select
                      value={draft.isActive ? "active" : "inactive"}
                      onChange={(event) =>
                        setDraftOverrides((current) => ({
                          ...current,
                          [override.id]: {
                            ...draft,
                            isActive: event.target.value === "active",
                          },
                        }))
                      }
                      style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
                    Starts at
                    <input
                      type="datetime-local"
                      value={draft.startsAt}
                      onChange={(event) =>
                        setDraftOverrides((current) => ({
                          ...current,
                          [override.id]: { ...draft, startsAt: event.target.value },
                        }))
                      }
                      style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
                    Ends at
                    <input
                      type="datetime-local"
                      value={draft.endsAt}
                      onChange={(event) =>
                        setDraftOverrides((current) => ({
                          ...current,
                          [override.id]: { ...draft, endsAt: event.target.value },
                        }))
                      }
                      style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
                    />
                  </label>
                </div>

                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
                  Reason / notes
                  <textarea
                    value={draft.reason}
                    onChange={(event) =>
                      setDraftOverrides((current) => ({
                        ...current,
                        [override.id]: { ...draft, reason: event.target.value },
                      }))
                    }
                    rows={2}
                    style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8 }}
                  />
                </label>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
