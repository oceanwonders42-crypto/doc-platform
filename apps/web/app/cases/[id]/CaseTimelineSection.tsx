"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = {
  caseId: string;
  lastRebuiltAt: string | null;
};

export default function CaseTimelineSection({ caseId, lastRebuiltAt }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rebuiltAt, setRebuiltAt] = useState<string | null>(lastRebuiltAt);

  async function handleRebuild() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/rebuild-timeline`, {
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
    <section
      style={{
        marginTop: 24,
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Case timeline</h2>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 12 }}>
        Timeline is rebuilt automatically when documents are routed to this case. You can rebuild manually below (admin).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Link
          href={`/cases/${caseId}/timeline`}
          style={{
            padding: "8px 14px",
            fontSize: 14,
            border: "1px solid #06c",
            borderRadius: 8,
            color: "#06c",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          View timeline
        </Link>
        {rebuiltAt && (
          <span style={{ fontSize: 14, color: "#666" }}>
            <strong>Last rebuilt:</strong> {new Date(rebuiltAt).toLocaleString()}
          </span>
        )}
        {loading && (
          <span style={{ fontSize: 14, color: "#666" }}>Rebuild queued…</span>
        )}
        <button
        type="button"
        onClick={handleRebuild}
        disabled={loading}
        style={{
          padding: "8px 14px",
          fontSize: 14,
          border: "1px solid #ccc",
          borderRadius: 8,
          background: loading ? "#f0f0f0" : "#fff",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 500,
        }}
      >
        {loading ? "Rebuilding…" : "Rebuild timeline"}
      </button>
      </div>
    </section>
  );
}
