"use client";

import Link from "next/link";
import { useState } from "react";

type RecordsRequest = {
  id: string;
  caseId: string;
  providerName: string;
  providerContact: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type LetterResponse = {
  ok?: boolean;
  text?: string;
  html?: string;
  request?: RecordsRequest;
  error?: string;
};

export function RecordsRequestCreateClient({
  caseId,
  initialRequestId,
}: {
  caseId: string;
  initialRequestId?: string;
}) {
  const [mode, setMode] = useState<"form" | "confirm">(
    initialRequestId ? "confirm" : "form"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<RecordsRequest | null>(null);
  const [letter, setLetter] = useState<LetterResponse | null>(null);

  const [providerName, setProviderName] = useState("");
  const [providerContact, setProviderContact] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notes, setNotes] = useState("");

  async function loadExisting(requestId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(requestId)}/letter`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as LetterResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Failed to load letter (${res.status})`);
      }
      if (data.request) {
        setRequest(data.request);
      }
      setLetter(data);
      setMode("confirm");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Load initial request if provided
  if (initialRequestId && !request && !letter && !loading && mode === "confirm") {
    void loadExisting(initialRequestId);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/records-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName,
          providerContact: providerContact.trim() || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          notes: notes || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; item?: RecordsRequest; error?: string };
      if (!res.ok || !data.ok || !data.item) {
        throw new Error(data.error || `Failed to create request (${res.status})`);
      }
      setRequest(data.item);

      const letterRes = await fetch(
        `/api/records-requests/${encodeURIComponent(data.item.id)}/letter`,
        { cache: "no-store" }
      );
      const letterData = (await letterRes.json().catch(() => ({}))) as LetterResponse;
      if (!letterRes.ok || !letterData.ok) {
        throw new Error(letterData.error || `Failed to generate letter (${letterRes.status})`);
      }
      setLetter(letterData);
      setMode("confirm");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkSent() {
    if (!request) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Sent" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; item?: RecordsRequest; error?: string };
      if (!res.ok || !data.ok || !data.item) {
        throw new Error(data.error || `Failed to update status (${res.status})`);
      }
      setRequest(data.item);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  if (mode === "form") {
    return (
      <form
        onSubmit={handleCreate}
        style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}
      >
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Provider name
          </label>
          <input
            type="text"
            required
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Provider contact block (optional)
          </label>
          <textarea
            value={providerContact}
            onChange={(e) => setProviderContact(e.target.value)}
            rows={3}
            placeholder="Name, department, street, city/state/ZIP"
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Date from
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Date to
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 6,
            alignSelf: "flex-start",
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Creating..." : "Generate letter"}
        </button>

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
            {error}
          </div>
        )}
      </form>
    );
  }

  return (
    <div>
      {loading && (
        <div style={{ marginBottom: 8, fontSize: 13, color: "#666" }}>Loading…</div>
      )}
      {error && (
        <div style={{ marginBottom: 8, fontSize: 12, color: "#b91c1c" }}>
          {error}
        </div>
      )}
      {letter && (
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            background: "#fafafa",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Letter preview</h3>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
              background: "#fff",
              maxHeight: 320,
              overflowY: "auto",
              fontSize: 14,
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: letter.html || "" }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleMarkSent}
          disabled={loading || !request}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            cursor: loading || !request ? "default" : "pointer",
            opacity: loading || !request ? 0.7 : 1,
          }}
        >
          Mark as Sent
        </button>

        <Link
          href={`/cases/${caseId}`}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Back to Case
        </Link>
      </div>

      {request && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
          Status: <strong>{request.status}</strong>
        </div>
      )}
    </div>
  );
}

