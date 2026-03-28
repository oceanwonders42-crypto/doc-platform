"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTimestamp } from "../../lib/formatTimestamp";
import { statusColors } from "../../lib/statusColors";

type DocumentActionCenterProps = {
  documentId: string;
  originalName: string;
  status: string;
  pageCount: number;
  mimeType: string | null;
  ingestedAt: string | null;
  routedCaseId: string | null;
  duplicateInfo: {
    original: { id: string; originalName: string } | null;
    duplicates: Array<{ id: string; originalName: string }>;
  };
  cases: Array<{ id: string; title?: string | null; caseNumber?: string | null; clientName?: string | null }>;
  extractedFields: Record<string, unknown> | null;
  auditEvents: Array<{
    id: string;
    action: string;
    actor: string;
    fromCaseId: string | null;
    toCaseId: string | null;
    createdAt: string;
  }>;
};

export default function DocumentActionCenter(props: DocumentActionCenterProps) {
  const {
    documentId,
    originalName,
    status,
    pageCount,
    mimeType,
    ingestedAt,
    routedCaseId,
    duplicateInfo,
    cases,
    extractedFields,
    auditEvents,
  } = props;
  const router = useRouter();
  const [selectedCaseId, setSelectedCaseId] = useState(routedCaseId ?? "");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAssign = async () => {
    if (!selectedCaseId.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routedCaseId: selectedCaseId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("success", "Assigned to case");
        router.refresh();
      } else {
        showToast("error", data?.error || "Failed");
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkNeedsReview = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_REVIEW", routingStatus: "needs_review" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("success", "Marked needs review");
        router.refresh();
      } else {
        showToast("error", data?.error || "Failed");
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkUnmatched = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "UNMATCHED", routedCaseId: null, routingStatus: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("success", "Marked unmatched");
        router.refresh();
      } else {
        showToast("error", data?.error || "Failed");
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const [downloadLoading, setDownloadLoading] = useState(false);

  const handleOpen = async () => {
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/download`);
      const data = (await res.json()) as { ok?: boolean; url?: string };
      if (data?.ok && data?.url) window.open(data.url, "_blank", "noopener");
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/download`);
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (data?.ok && data?.url) {
        window.open(data.url, "_blank", "noopener");
      }
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleDownloadClick = async () => {
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/download`);
      const data = (await res.json()) as { ok?: boolean; url?: string; originalName?: string };
      if (data?.ok && data?.url) {
        const a = document.createElement("a");
        a.href = data.url;
        a.download = data.originalName || originalName || "document.pdf";
        a.click();
      }
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 20,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Action center</h2>

      {/* Document metadata */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Document metadata</h3>
        <table style={{ fontSize: 14, width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top", width: 120 }}>Name</td>
              <td style={{ padding: 4 }}>{originalName || "—"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Status</td>
              <td style={{ padding: 4 }}>{status || "—"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Pages</td>
              <td style={{ padding: 4 }}>{pageCount ?? "—"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Type</td>
              <td style={{ padding: 4 }}>{mimeType || "—"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Ingested</td>
              <td style={{ padding: 4 }}>{formatTimestamp(ingestedAt)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Open / Download */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Document</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleOpen}
            disabled={downloadLoading}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: downloadLoading ? "not-allowed" : "pointer",
            }}
          >
            {downloadLoading ? "Opening…" : "Open"}
          </button>
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={downloadLoading}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#333",
              cursor: downloadLoading ? "not-allowed" : "pointer",
            }}
          >
            Download
          </button>
        </div>
      </section>

      {/* Case assignment */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Case assignment</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #ddd",
              minWidth: 200,
            }}
          >
            <option value="">Select case…</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber || c.clientName || c.title || c.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selectedCaseId && handleAssign()}
            disabled={actionLoading || !selectedCaseId.trim()}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: actionLoading || !selectedCaseId ? "not-allowed" : "pointer",
            }}
          >
            Assign
          </button>
        </div>
        {routedCaseId && (
          <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            Current case: <Link href={`/cases/${routedCaseId}`} style={{ color: "#06c", textDecoration: "underline" }}>{routedCaseId}</Link>
          </p>
        )}
      </section>

      {/* Mark needs review / unmatched */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Status actions</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleMarkNeedsReview}
            disabled={actionLoading}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #b45309",
              background: "#fff",
              color: "#b45309",
              cursor: actionLoading ? "not-allowed" : "pointer",
            }}
          >
            Mark needs review
          </button>
          <button
            type="button"
            onClick={handleMarkUnmatched}
            disabled={actionLoading}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #666",
              background: "#fff",
              color: "#333",
              cursor: actionLoading ? "not-allowed" : "pointer",
            }}
          >
            Mark unmatched
          </button>
        </div>
      </section>

      {/* Duplicate info */}
      {(duplicateInfo.original || duplicateInfo.duplicates.length > 0) && (
        <section>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Duplicates</h3>
          {duplicateInfo.original && (
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              Duplicate of{" "}
              <Link href={`/documents/${duplicateInfo.original.id}`} style={{ color: "#06c", textDecoration: "underline" }}>
                {duplicateInfo.original.originalName || duplicateInfo.original.id}
              </Link>
            </p>
          )}
          {duplicateInfo.duplicates.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {duplicateInfo.duplicates.map((d) => (
                <li key={d.id} style={{ marginBottom: 6 }}>
                  <Link href={`/documents/${d.id}`} style={{ color: "#06c", textDecoration: "underline", fontSize: 14 }}>
                    {d.originalName || d.id}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Extracted fields */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Extracted fields</h3>
        <pre
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 8,
            overflow: "auto",
            maxHeight: 240,
            margin: 0,
          }}
        >
          {extractedFields ? JSON.stringify(extractedFields, null, 2) : "No extracted fields yet. Run recognition."}
        </pre>
      </section>

      {/* Audit trail */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Audit trail</h3>
        {auditEvents.length === 0 ? (
          <p style={{ fontSize: 14, color: "#666" }}>No activity yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {auditEvents.map((e) => (
              <li
                key={e.id}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                  fontSize: 14,
                }}
              >
                <div>
                  <strong>{e.action}</strong> by {e.actor}
                  {(e.fromCaseId || e.toCaseId) && (
                    <span> (from {e.fromCaseId ?? "—"} to {e.toCaseId ?? "—"})</span>
                  )}
                </div>
                <div style={{ color: "#666", fontSize: 12 }}>{formatTimestamp(e.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 14,
            background: toast.type === "success" ? statusColors.success.bg : statusColors.error.bg,
            color: toast.type === "success" ? statusColors.success.text : statusColors.error.text,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
