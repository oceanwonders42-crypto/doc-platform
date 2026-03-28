"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { formatTimestamp } from "../../lib/formatTimestamp";
import { statusColors } from "../../lib/statusColors";
import { useToast } from "../../components/ToastProvider";
import { RecordsRequestRowActions } from "./records-requests/RecordsRequestRowActions";

type RecordsRequest = {
  id: string;
  caseId: string;
  providerName: string;
  providerContact?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ProviderOption = {
  id: string;
  providerId: string;
  provider: { id: string; name: string; city: string; state: string };
};

export default function CaseRequestsTab({ caseId }: { caseId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<RecordsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/records-requests`);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: RecordsRequest[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }, [caseId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await load();
      setLoading(false);
    }
    init();
  }, [load]);

  useEffect(() => {
    if (!modalOpen) return;
    setError(null);
    setLoadingProviders(true);
    fetch(`/api/cases/${encodeURIComponent(caseId)}/providers`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; items?: ProviderOption[] }) => {
        setProviders(Array.isArray(d?.items) ? d.items : []);
      })
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false));
  }, [modalOpen, caseId]);

  async function handleRequestRecords(providerId: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/records-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, providerId, status: "drafted" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; item?: RecordsRequest; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Failed to create (${res.status})`);
      }
      setModalOpen(false);
      toast.toastSuccess("Records request created");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <p style={{ color: "#666", fontSize: 14 }}>Loading records requests…</p>;
  }

  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Records Requests</h2>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Request Records
        </button>
        <Link
          href={`/cases/${caseId}/records-requests/new`}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            color: "#111",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          New Request (full)
        </Link>
      </div>

      {items.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>
          No records requests.{" "}
          <Link href={`/cases/${caseId}/records-requests/new`} style={{ color: "#06c", textDecoration: "underline" }}>
            Create one
          </Link>
        </p>
      ) : (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Created</th>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Provider</th>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Status</th>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{formatTimestamp(r.createdAt)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{r.providerName}</div>
                    <div style={{ fontSize: 12, color: "#666", whiteSpace: "pre-line" }}>{r.providerContact}</div>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: r.status === "received" ? statusColors.success.bg : r.status === "overdue" ? statusColors.error.bg : "#f5f5f5",
                        color: r.status === "received" ? statusColors.success.text : r.status === "overdue" ? statusColors.error.text : "#333",
                        fontWeight: 500,
                        textTransform: "capitalize",
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <RecordsRequestRowActions requestId={r.id} caseId={caseId} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
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
          onClick={() => !creating && setModalOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              minWidth: 400,
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Request Records</h3>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
              Select a provider to create a records request.
            </p>
            {error && (
              <p style={{ color: statusColors.error.text, fontSize: 14, marginBottom: 12 }}>{error}</p>
            )}
            {loadingProviders ? (
              <p style={{ color: "#666", fontSize: 14 }}>Loading providers…</p>
            ) : providers.length === 0 ? (
              <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
                No providers attached to this case.{" "}
                <Link href={`/cases/${caseId}?tab=providers`} style={{ color: "#06c", textDecoration: "underline" }}>
                  Attach a provider
                </Link>{" "}
                first.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px 0" }}>
                {providers.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      marginBottom: 6,
                      border: "1px solid #eee",
                      borderRadius: 6,
                      background: "#fafafa",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.provider.name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {p.provider.city}, {p.provider.state}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRequestRecords(p.providerId)}
                      disabled={creating}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid #111",
                        background: "#111",
                        color: "#fff",
                        fontSize: 13,
                        cursor: creating ? "not-allowed" : "pointer",
                      }}
                    >
                      {creating ? "Creating…" : "Request Records"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => !creating && setModalOpen(false)}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                color: "#666",
                fontSize: 14,
                cursor: creating ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
