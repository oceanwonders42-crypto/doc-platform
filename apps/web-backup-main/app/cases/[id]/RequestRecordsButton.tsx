"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Provider = { id: string; name: string; city: string; state: string };

export function RequestRecordsButton({ caseId, count }: { caseId: string; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items?: Provider[] }) => setProviders(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setProviders([]))
      .finally(() => {
        setLoading(false);
        setSelectedId("");
      });
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/records-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, providerId: selectedId, status: "drafted" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-block",
          padding: "10px 18px",
          borderRadius: 8,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Request Records ({count})
      </button>
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              minWidth: 360,
              maxWidth: "90vw",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Request Records</h3>
            <form onSubmit={handleSubmit}>
              {error && <p style={{ color: "#c00", fontSize: 13, marginBottom: 12 }}>{error}</p>}
              {loading ? (
                <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>Loading providers…</p>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Provider</label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      fontSize: 14,
                    }}
                  >
                    <option value="">Select provider…</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.city}, {p.state}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  disabled={loading || submitting || !selectedId}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    fontSize: 14,
                    cursor: loading || submitting ? "not-allowed" : "pointer",
                    opacity: loading || submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "Creating…" : "Create Request"}
                </button>
                <button
                  type="button"
                  onClick={() => !submitting && setOpen(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    background: "#fff",
                    color: "#666",
                    fontSize: 14,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
