"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { RecordsRequestRowActions } from "./records-requests/RecordsRequestRowActions";

type RecordsRequest = {
  id: string;
  caseId: string;
  providerName: string;
  providerContact: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function CaseRequestsTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<RecordsRequest[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <p style={{ color: "#666", fontSize: 14 }}>Loading records requests…</p>;
  }

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Link
          href={`/cases/${caseId}/records-requests/new`}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          New Request
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
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{r.providerName}</div>
                    <div style={{ fontSize: 12, color: "#666", whiteSpace: "pre-line" }}>{r.providerContact}</div>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{r.status}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <RecordsRequestRowActions requestId={r.id} caseId={caseId} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
