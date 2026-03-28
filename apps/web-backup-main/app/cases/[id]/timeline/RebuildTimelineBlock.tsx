"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimestamp } from "../../../lib/formatTimestamp";

type Props = {
  caseId: string;
  lastRebuiltAt: string | null;
};

export default function RebuildTimelineBlock({ caseId, lastRebuiltAt }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rebuiltAt, setRebuiltAt] = useState<string | null>(lastRebuiltAt);

  async function handleRebuild() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/timeline/rebuild`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202 && data.ok && data.queued) {
        setRebuiltAt(null);
        router.refresh();
        setTimeout(() => router.refresh(), 3000);
      } else if (res.ok && data.ok && data.lastRebuiltAt) {
        setRebuiltAt(data.lastRebuiltAt);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        marginBottom: 20,
        padding: "12px 16px",
        border: "1px solid #e5e5e5",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <button
        type="button"
        onClick={handleRebuild}
        disabled={loading}
        style={{
          padding: "8px 14px",
          fontSize: 14,
          border: "1px solid #111",
          borderRadius: 8,
          background: loading ? "#e0e0e0" : "#111",
          color: "#fff",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 500,
        }}
      >
        {loading ? "Rebuilding…" : "Rebuild timeline"}
      </button>
      {rebuiltAt && (
        <span style={{ fontSize: 14, color: "#666" }}>
          <strong>Last rebuilt:</strong> {formatTimestamp(rebuiltAt)}
        </span>
      )}
      {loading && (
        <span style={{ fontSize: 14, color: "#666" }}>Rebuild queued. Refreshing in a moment…</span>
      )}
    </div>
  );
}
