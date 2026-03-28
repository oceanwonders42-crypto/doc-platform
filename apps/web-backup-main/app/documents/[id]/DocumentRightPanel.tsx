"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { statusColors } from "../../lib/statusColors";

type Case = { id: string; title?: string | null; caseNumber?: string | null; clientName?: string | null };

export default function DocumentRightPanel({
  documentId,
  extractedFields,
  currentStatus,
  routedCaseId,
  initialCases,
}: {
  documentId: string;
  extractedFields: Record<string, unknown> | null;
  currentStatus: string;
  routedCaseId: string | null;
  initialCases: Case[];
}) {
  const router = useRouter();
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [assignCaseId, setAssignCaseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (initialCases.length === 0) {
      fetch("/api/cases")
        .then((res) => res.json())
        .then((data) => {
          const items = Array.isArray(data?.items) ? data.items : [];
          setCases(items);
        })
        .catch(() => {});
    }
  }, [initialCases.length]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  async function handleAssign() {
    if (!assignCaseId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routedCaseId: assignCaseId.trim() }),
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
      setLoading(false);
    }
  }

  async function handleAction(action: "NEEDS_REVIEW" | "UNMATCHED") {
    setLoading(true);
    try {
      const body =
        action === "UNMATCHED"
          ? { status: "UNMATCHED", routedCaseId: null, routingStatus: null }
          : { status: "NEEDS_REVIEW", routingStatus: "needs_review" };
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("success", action === "UNMATCHED" ? "Marked unmatched" : "Marked needs review");
        router.refresh();
      } else {
        showToast("error", data?.error || "Failed");
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Actions</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={assignCaseId}
              onChange={(e) => setAssignCaseId(e.target.value)}
              style={{
                padding: "8px 12px",
                fontSize: 14,
                borderRadius: 8,
                border: "1px solid #ddd",
                minWidth: 180,
              }}
            >
              <option value="">Assign to case…</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber || c.clientName || c.title || c.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAssign}
              disabled={loading || !assignCaseId.trim()}
              style={{
                padding: "8px 14px",
                fontSize: 14,
                borderRadius: 8,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                cursor: loading || !assignCaseId.trim() ? "not-allowed" : "pointer",
              }}
            >
              Assign
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleAction("NEEDS_REVIEW")}
              disabled={loading}
              style={{
                padding: "8px 14px",
                fontSize: 14,
                borderRadius: 8,
                border: "1px solid #b45309",
                background: "#fff",
                color: "#b45309",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Mark needs review
            </button>
            <button
              type="button"
              onClick={() => handleAction("UNMATCHED")}
              disabled={loading}
              style={{
                padding: "8px 14px",
                fontSize: 14,
                borderRadius: 8,
                border: "1px solid #666",
                background: "#fff",
                color: "#333",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Mark unmatched
            </button>
          </div>
        </div>
        {(currentStatus || routedCaseId) && (
          <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Status: {currentStatus} {routedCaseId && `· Case: ${routedCaseId}`}
          </p>
        )}
        {toast && (
          <div
            role="alert"
            style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 13,
              background: toast.type === "success" ? statusColors.success.bg : statusColors.error.bg,
              color: toast.type === "success" ? statusColors.success.text : statusColors.error.text,
            }}
          >
            {toast.message}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Extracted fields</h3>
        <pre
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 8,
            overflow: "auto",
            maxHeight: 400,
            margin: 0,
          }}
        >
          {extractedFields
            ? JSON.stringify(extractedFields, null, 2)
            : "No extracted fields yet. Run recognition."}
        </pre>
      </section>
    </div>
  );
}
