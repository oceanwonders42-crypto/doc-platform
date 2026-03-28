"use client";

import { useState, useEffect, useCallback } from "react";

type Note = { id: string; body: string; createdAt: string };

export default function CaseNotes({
  caseId,
  firmId,
}: {
  caseId: string;
  firmId?: string | null;
}) {
  const [items, setItems] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const qs = firmId ? `?firmId=${encodeURIComponent(firmId)}` : "";
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/notes${qs}`);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: Note[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }, [caseId, firmId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await load();
      setLoading(false);
    }
    init();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const payload: { body: string; firmId?: string } = { body: text };
      if (firmId) payload.firmId = firmId;
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setBody("");
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p style={{ color: "#666", fontSize: 14 }}>Loading notes…</p>;
  }

  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Notes</h2>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Add and view notes for this case.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: 24,
          padding: 16,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
        }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          style={{
            width: "100%",
            padding: 12,
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 8,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          style={{
            marginTop: 10,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: submitting || !body.trim() ? "#ccc" : "#111",
            color: "#fff",
            fontSize: 14,
            cursor: submitting || !body.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Adding…" : "Add note"}
        </button>
      </form>

      {items.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>No notes yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((n) => (
            <li
              key={n.id}
              style={{
                padding: 16,
                marginBottom: 12,
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{n.body}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
