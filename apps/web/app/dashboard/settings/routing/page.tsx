"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const MIN_CONF = 0.5;
const MAX_CONF = 0.99;

type RoutingRules = {
  minAutoRouteConfidence: number;
  autoRouteEnabled: boolean;
  autoCreateCaseFromDoc?: boolean;
  autoRoutedThisMonth?: number;
};

export default function RoutingSettingsPage() {
  const [rules, setRules] = useState<RoutingRules | null>(null);
  const [autoRoutedThisMonth, setAutoRoutedThisMonth] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [autoRouteEnabled, setAutoRouteEnabled] = useState(false);
  const [minAutoRouteConfidence, setMinAutoRouteConfidence] = useState(0.9);
  const [autoCreateCaseFromDoc, setAutoCreateCaseFromDoc] = useState(false);

  useEffect(() => {
    fetch("/api/settings/routing")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        return res.json();
      })
      .then((data: RoutingRules) => {
        setRules(data);
        setAutoRouteEnabled(data.autoRouteEnabled);
        setMinAutoRouteConfidence(
          Math.max(MIN_CONF, Math.min(MAX_CONF, data.minAutoRouteConfidence ?? 0.9))
        );
        setAutoCreateCaseFromDoc(data.autoCreateCaseFromDoc ?? false);
        setAutoRoutedThisMonth(data.autoRoutedThisMonth ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    fetch("/api/settings/routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoRouteEnabled,
        minAutoRouteConfidence: Math.max(MIN_CONF, Math.min(MAX_CONF, minAutoRouteConfidence)),
        autoCreateCaseFromDoc,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save");
        return res.json();
      })
      .then((data: RoutingRules) => {
        setRules(data);
        setAutoRouteEnabled(data.autoRouteEnabled);
        setMinAutoRouteConfidence(
          Math.max(MIN_CONF, Math.min(MAX_CONF, data.minAutoRouteConfidence ?? 0.9))
        );
        setAutoCreateCaseFromDoc(data.autoCreateCaseFromDoc ?? false);
        setAutoRoutedThisMonth(data.autoRoutedThisMonth ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setSaving(false));
  };

  const dirty =
    rules != null &&
    (rules.autoRouteEnabled !== autoRouteEnabled ||
      rules.minAutoRouteConfidence !== minAutoRouteConfidence ||
      (rules.autoCreateCaseFromDoc ?? false) !== autoCreateCaseFromDoc);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 560,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/dashboard" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Routing rules</h1>
      </div>

      <p style={{ color: "#666", marginBottom: 12, fontSize: 14 }}>
        When a document has a suggested case and confidence meets the threshold, it can be
        auto-routed so it skips the review queue.
      </p>
      {!loading && (
        <p style={{ color: "#555", marginBottom: 20, fontSize: 13 }}>
          <strong>{autoRoutedThisMonth}</strong> document{autoRoutedThisMonth !== 1 ? "s" : ""} auto-routed this month.
        </p>
      )}

      {loading && <p style={{ color: "#666" }}>Loading…</p>}
      {error && (
        <p style={{ color: "#c00", marginBottom: 12 }}>{error}</p>
      )}

      {!loading && (
        <section
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={autoRouteEnabled}
                onChange={(e) => setAutoRouteEnabled(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              Auto-route high-confidence documents
            </label>
            <p style={{ margin: "6px 0 0 28px", fontSize: 13, color: "#666" }}>
              When on, documents with confidence ≥ min confidence and a suggested case are routed
              automatically and do not appear in the review queue.
            </p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={autoCreateCaseFromDoc}
                onChange={(e) => setAutoCreateCaseFromDoc(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              Auto-create case from unmatched documents
            </label>
            <p style={{ margin: "6px 0 0 28px", fontSize: 13, color: "#666" }}>
              When on, unmatched documents with an extracted client name will automatically create
              a new case and route the document to it. <strong>Warning:</strong> This may create
              duplicate cases if the client name varies across documents (e.g. "John Doe" vs "John M. Doe").
            </p>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>
              Min auto-route confidence (0.50 – 0.99)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input
                type="range"
                min={MIN_CONF}
                max={MAX_CONF}
                step={0.01}
                value={minAutoRouteConfidence}
                onChange={(e) => setMinAutoRouteConfidence(parseFloat(e.target.value) || MIN_CONF)}
                style={{ flex: "1 1 200px", minWidth: 120 }}
              />
              <input
                type="number"
                min={MIN_CONF}
                max={MAX_CONF}
                step={0.01}
                value={minAutoRouteConfidence}
                onChange={(e) =>
                  setMinAutoRouteConfidence(
                    Math.max(MIN_CONF, Math.min(MAX_CONF, parseFloat(e.target.value) || MIN_CONF))
                  )
                }
                style={{
                  width: 72,
                  padding: "6px 8px",
                  fontSize: 14,
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>
            <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "#666" }}>
              Only documents with match confidence ≥ this value are auto-routed (e.g. 0.9 = 90%).
            </p>
          </div>

          {dirty && (
            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "#111",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
