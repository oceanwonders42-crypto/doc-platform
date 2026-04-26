"use client";

import { FormEvent, useState } from "react";
import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";

type AssistantSource = {
  kind?: string;
  label: string;
  documentId?: string | null;
};

type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  sources?: AssistantSource[];
  warnings?: string[];
};

type AssistantChatPanelProps = {
  caseId?: string;
  placeholder?: string;
};

export function AssistantChatPanel({
  caseId,
  placeholder = "Ask Onyx about this workspace...",
}: AssistantChatPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBase()}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ question: trimmed, caseId }),
      });
      const data = (await parseJsonResponse(response)) as {
        ok?: boolean;
        error?: string;
        item?: {
          answer?: string;
          sources?: AssistantSource[];
          warnings?: string[];
        };
      };
      if (!response.ok || data.ok === false || !data.item?.answer) {
        throw new Error(data.error ?? "The assistant could not answer that question.");
      }
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: data.item?.answer ?? "",
          sources: data.item?.sources ?? [],
          warnings: data.item?.warnings ?? [],
        },
      ]);
    } catch (requestError) {
      setError(
        formatApiClientError(
          requestError,
          "The assistant could not answer that question. Please try again."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      <div
        style={{
          border: "1px solid var(--onyx-border-subtle)",
          borderRadius: "var(--onyx-radius-md)",
          background: "var(--onyx-background-surface)",
          padding: "0.9rem",
          maxHeight: 320,
          overflow: "auto",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.88rem", lineHeight: 1.55 }}>
            Ask about navigation, firm status, missing records, bills vs treatment, demand drafts, or this case.
            Answers are grounded in the firm or case context currently available.
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              style={{
                justifySelf: message.role === "user" ? "end" : "start",
                maxWidth: "92%",
                borderRadius: "1rem",
                padding: "0.75rem 0.85rem",
                background:
                  message.role === "user"
                    ? "rgba(201, 162, 39, 0.14)"
                    : "rgba(255, 255, 255, 0.72)",
                border: "1px solid var(--onyx-border-subtle)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55 }}>{message.text}</p>
              {message.sources && message.sources.length > 0 ? (
                <p style={{ margin: "0.45rem 0 0", fontSize: "0.76rem", color: "var(--onyx-text-muted)" }}>
                  Sources: {message.sources.map((source) => source.label).join(", ")}
                </p>
              ) : null}
              {message.warnings && message.warnings.length > 0 ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.76rem", color: "var(--onyx-warning)" }}>
                  {message.warnings.join(" ")}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>

      {error ? <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.84rem" }}>{error}</p> : null}

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="onyx-input"
          placeholder={placeholder}
          aria-label="Ask Onyx assistant"
          style={{ flex: 1 }}
        />
        <button type="submit" className="onyx-btn-primary" disabled={loading || !question.trim()}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>
    </div>
  );
}
