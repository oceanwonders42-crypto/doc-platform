import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTimestamp } from "../../../lib/formatTimestamp";
import { RecordsRequestRowActions } from "./RecordsRequestRowActions";

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

async function fetchRecordsRequests(caseId: string): Promise<RecordsRequest[]> {
  const base = process.env.DOC_WEB_BASE_URL ?? "";
  const res = await fetch(`${base}/api/cases/${caseId}/records-requests`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: RecordsRequest[] };
  return Array.isArray(data.items) ? data.items : [];
}

export default async function CaseRecordsRequestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const items = await fetchRecordsRequests(id);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Records requests for case {id}
      </h1>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <Link
          href={`/cases/${id}`}
          style={{ fontSize: 13, color: "#111", textDecoration: "underline" }}
        >
          ← Back to case
        </Link>
        <Link
          href={`/cases/${id}/records-requests/new`}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          New Request
        </Link>
      </div>

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
                <td style={{ padding: "10px 12px", fontSize: 13 }}>
                  {formatTimestamp(r.createdAt)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{r.providerName}</div>
                  <div style={{ fontSize: 12, color: "#666", whiteSpace: "pre-line" }}>
                    {r.providerContact}
                  </div>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13 }}>{r.status}</td>
                <td style={{ padding: "10px 12px", fontSize: 13 }}>
                  <RecordsRequestRowActions requestId={r.id} caseId={id} status={r.status} />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 14, fontSize: 14, color: "#666" }}>
                  No records requests for this case yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

