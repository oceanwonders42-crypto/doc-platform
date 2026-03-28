"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

type Provider = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
};

type RecordsRequest = {
  id: string;
  caseId: string;
  providerName: string;
  providerContact?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  notes?: string | null;
  letterBody?: string | null;
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

export function NewRecordsRequestClient({
  caseId,
  initialRequestId,
  initialProviderId,
}: {
  caseId: string;
  initialRequestId?: string;
  initialProviderId?: string;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [mode, setMode] = useState<"form" | "letter">(initialRequestId ? "letter" : "form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<RecordsRequest | null>(null);
  const [letterBody, setLetterBody] = useState("");
  const [generatedDocumentId, setGeneratedDocumentId] = useState<string | null>(null);
  const [sendChannel, setSendChannel] = useState<"email" | "fax">("email");
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);

  const [providerId, setProviderId] = useState(initialProviderId ?? "");
  const [providerNameManual, setProviderNameManual] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/providers", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { items?: Provider[] };
        setProviders(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!initialRequestId) return;
    async function loadExisting() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/records-requests/${encodeURIComponent(initialRequestId as string)}/letter`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as LetterResponse;
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Failed to load (${res.status})`);
        }
        if (data.request) setRequest(data.request);
        setLetterBody(data.text ?? data.request?.letterBody ?? "");
        setMode("letter");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    loadExisting();
  }, [initialRequestId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = providerId
      ? providers.find((p) => p.id === providerId)?.name ?? providerNameManual
      : providerNameManual.trim();
    if (!name) {
      setError("Select a provider or enter provider name");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        providerName: name,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        notes: notes.trim() || undefined,
      };
      if (providerId) body.providerId = providerId;

      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/records-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        item?: RecordsRequest;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.item) {
        throw new Error(data.error || `Failed to create (${res.status})`);
      }
      setRequest(data.item);
      setLetterBody(data.item.letterBody ?? "");
      setMode("letter");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveLetter() {
    if (!request) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterBody }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        item?: RecordsRequest;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.item) {
        throw new Error(data.error || `Failed to save (${res.status})`);
      }
      setRequest(data.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePdf() {
    if (!request) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(request.id)}/generate-pdf`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; documentId?: string; error?: string };
      if (!res.ok || !data.ok || !data.documentId) {
        throw new Error(data.error || `Failed to generate (${res.status})`);
      }
      setGeneratedDocumentId(data.documentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!request) return;
    if (!sendTo.trim()) {
      setError(sendChannel === "email" ? "Enter email address" : "Enter fax number");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(request.id)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: sendChannel, to: sendTo.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      setRequest({ ...request, status: "Sent" });
      setSendTo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
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
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        item?: RecordsRequest;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.item) {
        throw new Error(data.error || `Failed to update (${res.status})`);
      }
      setRequest(data.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%" as const,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 14,
  };

  if (mode === "form") {
    return (
      <form
        onSubmit={handleCreate}
        style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}
      >
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Provider *
          </label>
          {loadingProviders ? (
            <div style={{ ...inputStyle, padding: 12, color: "#666" }}>Loading providers…</div>
          ) : providers.length > 0 ? (
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              style={inputStyle}
              required
            >
              <option value="">Select a provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.city}, {p.state}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              required
              value={providerNameManual}
              onChange={(e) => setProviderNameManual(e.target.value)}
              placeholder="Provider / facility name"
              style={inputStyle}
            />
          )}
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Date from
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={inputStyle}
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
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional notes for the request"
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
          Letter body is generated automatically from case and provider info. You can edit it after
          creation.
        </p>

        <button
          type="submit"
          disabled={loading}
          style={{
            alignSelf: "flex-start",
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Creating…" : "Create & Generate Letter"}
        </button>

        {error && (
          <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
        )}
      </form>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {loading && !request && (
        <div style={{ fontSize: 14, color: "#666" }}>Loading…</div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
      )}

      {request && (
        <>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Letter (edit before save)</h3>
            <textarea
              value={letterBody}
              onChange={(e) => setLetterBody(e.target.value)}
              rows={14}
              style={{
                ...inputStyle,
                fontFamily: "inherit",
                resize: "vertical",
                minHeight: 240,
              }}
              placeholder="Letter body will be generated…"
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={handleSaveLetter}
              disabled={loading}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Save Letter
            </button>
            {request.status !== "Sent" && (
              <form
                onSubmit={handleSend}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <select
                  value={sendChannel}
                  onChange={(e) => setSendChannel(e.target.value as "email" | "fax")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 14,
                  }}
                >
                  <option value="email">Email</option>
                  <option value="fax">Fax</option>
                </select>
                <input
                  type={sendChannel === "email" ? "email" : "text"}
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder={sendChannel === "email" ? "Email address" : "Fax number"}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 14,
                    minWidth: 200,
                  }}
                />
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #22c55e",
                    background: "#22c55e",
                    color: "#fff",
                    fontSize: 14,
                    cursor: sending ? "not-allowed" : "pointer",
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
            )}
            {request.status === "Sent" && (
              <span style={{ padding: "8px 16px", fontSize: 14, color: "#22c55e", fontWeight: 600 }}>Sent</span>
            )}
            <button
              type="button"
              onClick={handleMarkSent}
              disabled={loading || request.status === "Sent"}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #666",
                background: "#fff",
                color: "#333",
                fontSize: 14,
                cursor: loading || request.status === "Sent" ? "not-allowed" : "pointer",
                opacity: loading || request.status === "Sent" ? 0.7 : 1,
              }}
            >
              Mark as Sent
            </button>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={loading}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #666",
                background: "#fff",
                color: "#111",
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Generating…" : "Generate PDF"}
            </button>
            <Link
              href={`/api/records-requests/${request.id}/letter?format=pdf`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #666",
                background: "#fff",
                color: "#111",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Download PDF (temp)
            </Link>
            {generatedDocumentId && (
              <Link
                href={`/documents/${generatedDocumentId}`}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #22c55e",
                  background: "#22c55e",
                  color: "#fff",
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                View Document →
              </Link>
            )}
            <Link
              href={`/cases/${caseId}/records-requests`}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fafafa",
                color: "#111",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Back to list
            </Link>
          </div>

          <div style={{ fontSize: 13, color: "#666" }}>
            Status: <strong>{request.status}</strong>
          </div>
        </>
      )}
    </div>
  );
}
