"use client";

import { useState, useCallback } from "react";

export default function CopyCaseIdButton({ caseId }: { caseId: string }) {
  const [toast, setToast] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(caseId);
      setToast("Copied!");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("Failed to copy");
      setTimeout(() => setToast(null), 2000);
    }
  }, [caseId]);

  const displayId = caseId.length > 12 ? `${caseId.slice(0, 8)}…` : caseId;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <code
        style={{
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
          color: "#555",
          background: "#f0f0f0",
          padding: "2px 6px",
          borderRadius: 4,
        }}
      >
        {displayId}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          padding: "4px 10px",
          fontSize: 12,
          border: "1px solid #ccc",
          borderRadius: 6,
          background: "#fff",
          color: "#555",
          cursor: "pointer",
        }}
      >
        Copy ID
      </button>
      {toast && (
        <span
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            color: "#1b5e20",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            zIndex: 9999,
          }}
        >
          {toast}
        </span>
      )}
    </div>
  );
}
