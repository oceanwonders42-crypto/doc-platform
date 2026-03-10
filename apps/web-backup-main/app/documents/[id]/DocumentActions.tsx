"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimestamp } from "../../lib/formatTimestamp";
import { statusColors } from "../../lib/statusColors";

type Toast = { type: "success" | "error"; message: string } | null;

export default function DocumentActions({
  documentId,
  lastRunAt,
  errors,
}: {
  documentId: string;
  lastRunAt: string | null;
  errors: string | null;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [recognizeLoading, setRecognizeLoading] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [reprocessLoading, setReprocessLoading] = useState<string | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  async function handleRecognize() {
    setRecognizeLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/recognize`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast("success", "Recognition started successfully.");
        router.refresh();
      } else {
        showToast("error", data.error || `Request failed (${res.status})`);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setRecognizeLoading(false);
    }
  }

  async function handleRematch() {
    setRematchLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/rematch`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast("success", `Re-run matching done. ${data.matchReason ?? ""}`);
        router.refresh();
      } else {
        showToast("error", data.error || `Request failed (${res.status})`);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setRematchLoading(false);
    }
  }

  async function handleReprocess(mode: "full" | "ocr" | "extraction") {
    setReprocessLoading(mode);
    try {
      const res = await fetch(`/api/documents/${documentId}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const labels = { full: "Retry processing", ocr: "Retry OCR", extraction: "Rebuild extraction" };
        showToast("success", `${labels[mode]} queued.`);
        router.refresh();
      } else {
        showToast("error", data.error || `Request failed (${res.status})`);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setReprocessLoading(null);
    }
  }

  return (
    <section
      style={{
        marginTop: 16,
        marginBottom: 24,
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Recognition & matching</h2>
      {lastRunAt != null && (
        <p style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
          <strong>Last run:</strong> {formatTimestamp(lastRunAt)}
        </p>
      )}
      {errors && (
        <p style={{ fontSize: 14, color: "#b00020", marginBottom: 8 }}>{errors}</p>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => handleReprocess("full")}
          disabled={reprocessLoading !== null}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: reprocessLoading ? "#f0f0f0" : "#1a237e",
            color: reprocessLoading ? "#888" : "#fff",
            cursor: reprocessLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {reprocessLoading === "full" ? "Running…" : "Retry processing"}
        </button>
        <button
          type="button"
          onClick={() => handleReprocess("ocr")}
          disabled={reprocessLoading !== null}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: reprocessLoading ? "#f0f0f0" : "#283593",
            color: reprocessLoading ? "#888" : "#fff",
            cursor: reprocessLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {reprocessLoading === "ocr" ? "Running…" : "Retry OCR"}
        </button>
        <button
          type="button"
          onClick={() => handleReprocess("extraction")}
          disabled={reprocessLoading !== null}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: reprocessLoading ? "#f0f0f0" : "#3949ab",
            color: reprocessLoading ? "#888" : "#fff",
            cursor: reprocessLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {reprocessLoading === "extraction" ? "Running…" : "Rebuild extraction"}
        </button>
        <button
          type="button"
          onClick={handleRecognize}
          disabled={recognizeLoading}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: recognizeLoading ? "#f0f0f0" : "#111",
            color: recognizeLoading ? "#888" : "#fff",
            cursor: recognizeLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {recognizeLoading ? "Running…" : "Retry recognition"}
        </button>
        <button
          type="button"
          onClick={handleRematch}
          disabled={rematchLoading}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: rematchLoading ? "#f0f0f0" : "#333",
            color: rematchLoading ? "#888" : "#fff",
            cursor: rematchLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {rematchLoading ? "Running…" : "Re-run matching"}
        </button>
      </div>
      {toast && (
        <div
          role="alert"
          style={{
            marginTop: 12,
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
    </section>
  );
}
