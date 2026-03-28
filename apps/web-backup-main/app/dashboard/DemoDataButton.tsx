"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { show: boolean };

export default function DemoDataButton({ show }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (!show) return null;

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/demo/seed", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setMessage("Demo data generated. Refreshing…");
        router.refresh();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage(data.error || `Failed (${res.status})`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "6px 12px",
          fontSize: 13,
          border: "1px solid #888",
          borderRadius: 6,
          background: loading ? "#eee" : "#fff",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Generating…" : "Generate demo data"}
      </button>
      {message && (
        <span style={{ fontSize: 12, color: message.startsWith("Demo") ? "#2e7d32" : "#b00020" }}>
          {message}
        </span>
      )}
    </span>
  );
}
