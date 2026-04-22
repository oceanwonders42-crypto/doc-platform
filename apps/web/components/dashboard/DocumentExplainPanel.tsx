"use client";

import { useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

const SUGGESTIONS = [
  "What injuries are described?",
  "What dates matter here?",
  "Which provider is involved?",
  "Is there any settlement offer?",
];

type ExplainResponse = {
  ok?: boolean;
  bullets?: string[];
  error?: string;
};

export function DocumentExplainPanel({ documentId }: { documentId: string }) {
  const [question, setQuestion] = useState("");
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function askDocument(questionText: string) {
    const trimmed = questionText.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setBullets(null);

    try {
      const response = await fetch(`${getApiBase()}/documents/${documentId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await parseJsonResponse(response)) as ExplainResponse;
      if (!response.ok || !data.ok || !Array.isArray(data.bullets)) {
        setError(data.error ?? "Failed to get explanation.");
        return;
      }
      setBullets(data.bullets);
      setQuestion(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardCard title="Explain this document">
      <p style={{ margin: "0 0 0.875rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
        Ask a focused question about the OCR text and extracted fields.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.875rem" }}>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => askDocument(suggestion)}
            disabled={loading}
            className="onyx-btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.35rem 0.6rem" }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void askDocument(question);
        }}
        style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}
      >
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about this document..."
          className="onyx-input"
          style={{ flex: 1, minWidth: 220 }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()} className="onyx-btn-primary">
          {loading ? "Asking..." : "Ask"}
        </button>
      </form>

      {error && <p style={{ margin: "0.875rem 0 0", fontSize: "0.875rem", color: "var(--onyx-error)" }}>{error}</p>}

      {bullets != null && bullets.length > 0 && (
        <div
          className="onyx-card"
          style={{
            marginTop: "1rem",
            padding: "1rem 1.125rem",
            background: "var(--onyx-background-surface)",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Answer</p>
          <ul style={{ margin: 0, paddingLeft: "1.125rem", fontSize: "0.875rem", lineHeight: 1.5 }}>
            {bullets.map((bullet, index) => (
              <li key={`${index}-${bullet.slice(0, 20)}`}>{bullet}</li>
            ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}
