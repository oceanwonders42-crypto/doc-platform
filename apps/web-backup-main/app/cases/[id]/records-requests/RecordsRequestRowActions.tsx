"use client";

import Link from "next/link";
import { useState } from "react";

export function RecordsRequestRowActions({
  requestId,
  caseId,
  status,
}: {
  requestId: string;
  caseId: string;
  status?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "fax">("email");
  const [to, setTo] = useState("");
  const [sent, setSent] = useState(false);

  async function handleGeneratePdf() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(requestId)}/generate-pdf`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; documentId?: string; error?: string };
      if (!res.ok || !data.ok || !data.documentId) {
        throw new Error(data.error || `Failed to generate (${res.status})`);
      }
      setDocumentId(data.documentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) {
      setError(channel === "email" ? "Enter email address" : "Enter fax number");
      return;
    }
    setSendLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(requestId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, to: to.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      setSendOpen(false);
      setTo("");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendLoading(false);
    }
  }

  const isSent = sent || status === "Sent";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link
          href={`/records-requests/${encodeURIComponent(requestId)}`}
          style={{ fontSize: 13, color: "#111", textDecoration: "underline" }}
        >
          View / Edit
        </Link>
        {!isSent && (
          <>
            <button
              type="button"
              onClick={() => setSendOpen(!sendOpen)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #22c55e",
                background: "#22c55e",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Send
            </button>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={loading}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #666",
                background: "#fff",
                color: "#333",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Generating…" : "Generate PDF"}
            </button>
          </>
        )}
        {isSent && (
          <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 500 }}>Sent</span>
        )}
      </div>
      {sendOpen && !isSent && (
        <form
          onSubmit={handleSend}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 12,
            border: "1px solid #e5e5e5",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as "email" | "fax")}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            >
              <option value="email">Email</option>
              <option value="fax">Fax</option>
            </select>
            <input
              type={channel === "email" ? "email" : "text"}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={channel === "email" ? "Email address" : "Fax number"}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #ccc",
                minWidth: 180,
              }}
            />
            <button
              type="submit"
              disabled={sendLoading}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 6,
                border: "none",
                background: "#111",
                color: "#fff",
                cursor: sendLoading ? "not-allowed" : "pointer",
              }}
            >
              {sendLoading ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setSendOpen(false)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <span style={{ fontSize: 12, color: "#b91c1c" }}>{error}</span>
      )}
      {documentId && (
        <Link
          href={`/documents/${documentId}`}
          style={{ fontSize: 12, color: "#06c", textDecoration: "underline" }}
        >
          View document →
        </Link>
      )}
    </div>
  );
}
