"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";

const POLL_INTERVAL_MS = 2000;
const POLL_DURATION_MS = 10000;

type PollEntry = { at: string; status: string; confidence?: number | null };

export default function IngestTest() {
  const [file, setFile] = useState<File | null>(null);
  const [firmId, setFirmId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [pollLog, setPollLog] = useState<PollEntry[]>([]);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollStatus = useCallback((docId: string, startTime: number) => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= POLL_DURATION_MS) return;

    fetch(`/api/documents/${docId}/recognition`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { ok?: boolean; document?: { status: string; confidence?: number | null } }) => {
        const status = data?.document?.status ?? "unknown";
        const confidence = data?.document?.confidence ?? null;
        setPollLog((prev) => [
          ...prev,
          { at: new Date().toISOString(), status, confidence },
        ]);
      })
      .catch(() => {
        setPollLog((prev) => [
          ...prev,
          { at: new Date().toISOString(), status: "error", confidence: null },
        ]);
      })
      .finally(() => {
        pollTimeoutRef.current = setTimeout(
          () => pollStatus(docId, startTime),
          POLL_INTERVAL_MS
        );
      });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setDocumentId(null);
    setDuplicate(false);
    setPollLog([]);
    stopPolling();

    try {
      const fd = new FormData();
      fd.append("source", "admin-debug");
      fd.append("file", file);
      if (firmId.trim()) fd.append("firmId", firmId.trim());

      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      const data = JSON.parse(text) as { ok?: boolean; documentId?: string; duplicate?: boolean };
      const docId = data?.documentId;
      if (!docId) throw new Error("No documentId in response");

      setDocumentId(docId);
      setDuplicate(data.duplicate === true);
      if (!data.duplicate) pollStatus(docId, Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (!documentId) return;
    const t = setTimeout(() => stopPolling(), POLL_DURATION_MS + 500);
    return () => clearTimeout(t);
  }, [documentId, stopPolling]);

  return (
    <section
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        Ingest test PDF
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              PDF file
            </label>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              Firm ID (optional; ingest uses API key firm if omitted)
            </label>
            <input
              type="text"
              value={firmId}
              onChange={(e) => setFirmId(e.target.value)}
              placeholder="Leave empty for default"
              style={{ padding: "6px 10px", width: 240, maxWidth: "100%" }}
            />
          </div>
          <button
            type="submit"
            disabled={!file || loading}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: !file || loading ? "#f3f3f3" : "#111",
              color: !file || loading ? "#888" : "#fff",
              cursor: !file || loading ? "not-allowed" : "pointer",
              fontWeight: 600,
              alignSelf: "flex-start",
            }}
          >
            {loading ? "Uploading…" : "Ingest test PDF"}
          </button>
        </div>
      </form>

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#b00020" }}>{error}</p>
      )}

      {documentId && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          {duplicate && (
            <p style={{ margin: "0 0 8px 0" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "#fff3e0",
                  color: "#e65100",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Duplicate detected
              </span>
              {" "}Same file was already ingested (same firm + hash in last 30 days). Linked to existing document below.
            </p>
          )}
          <p style={{ margin: "0 0 4px 0" }}>
            <strong>Document ID:</strong>{" "}
            <code style={{ background: "#f0f0f0", padding: "2px 6px", borderRadius: 4 }}>
              {documentId}
            </code>
          </p>
          <p style={{ margin: 0 }}>
            <Link
              href={`/documents/${documentId}`}
              style={{ color: "#111", textDecoration: "underline" }}
            >
              Open /documents/{documentId}
            </Link>
          </p>
        </div>
      )}

      {pollLog.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
            Status updates (poll every 2s, 10s)
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: "#333",
              maxHeight: 120,
              overflow: "auto",
            }}
          >
            {pollLog.map((entry, i) => (
              <li key={i}>
                {entry.at.slice(11, 19)} — status: {entry.status}
                {entry.confidence != null && `, confidence: ${entry.confidence}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
