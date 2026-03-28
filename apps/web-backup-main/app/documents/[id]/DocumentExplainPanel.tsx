"use client";

import { useState } from "react";

const SUGGESTIONS = [
  "What injuries?",
  "What dates?",
  "What provider?",
  "Any settlement offer?",
];

type ExplainResponse = {
  ok: boolean;
  bullets?: string[];
  error?: string;
};

export default function DocumentExplainPanel({ documentId }: { documentId: string }) {
  const [question, setQuestion] = useState("");
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setBullets(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => ({}))) as ExplainResponse;
      if (data.ok && Array.isArray(data.bullets)) {
        setBullets(data.bullets);
      } else {
        setError(data.error || "Failed to get explanation");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function useSuggestion(s: string) {
    setQuestion(s);
    setLoading(true);
    setError(null);
    setBullets(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: s }),
      });
      const data = (await res.json().catch(() => ({}))) as ExplainResponse;
      if (data.ok && Array.isArray(data.bullets)) {
        setBullets(data.bullets);
      } else {
        setError(data.error || "Failed to get explanation");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 20,
        background: "#fff",
        marginTop: 24,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Explain this document</h3>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        Ask a question about this document. Answers use extracted data and OCR text.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => useSuggestion(s)}
            disabled={loading}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #ddd",
              background: loading ? "#f0f0f0" : "#fafafa",
              cursor: loading ? "not-allowed" : "pointer",
              color: "#333",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this document…"
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 14px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              border: "1px solid #111",
              borderRadius: 8,
              background: loading || !question.trim() ? "#ccc" : "#111",
              color: "#fff",
              cursor: loading || !question.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "…" : "Ask"}
          </button>
        </div>
      </form>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            background: "#ffebee",
            color: "#b71c1c",
          }}
        >
          {error}
        </div>
      )}

      {bullets != null && bullets.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "#f9f9f9",
            borderRadius: 8,
            border: "1px solid #eee",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#333" }}>
            Answer
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6, color: "#333" }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
