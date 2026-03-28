"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { PageHeader } from "../../components/PageHeader";
import { formatDate, formatTimestamp } from "../../lib/formatTimestamp";

type RecordsRequest = {
  id: string;
  caseId: string;
  providerId?: string | null;
  providerName: string;
  providerContact?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  notes?: string | null;
  letterBody?: string | null;
  status: string;
  generatedDocumentId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type CaseInfo = {
  id: string;
  title?: string | null;
  caseNumber?: string | null;
  clientName?: string | null;
};

type RecordsRequestAttempt = {
  id: string;
  channel: string;
  destination: string;
  ok: boolean;
  error?: string | null;
  externalId?: string | null;
  createdAt: string;
};

export function RecordsRequestDetailClient({ id }: { id: string }) {
  const [item, setItem] = useState<RecordsRequest | null>(null);
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [letterBody, setLetterBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<"email" | "fax">("email");
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [attempts, setAttempts] = useState<RecordsRequestAttempt[]>([]);

  const load = useCallback(async () => {
    const [res, attemptsRes] = await Promise.all([
      fetch(`/api/records-requests/${encodeURIComponent(id)}`),
      fetch(`/api/records-requests/${encodeURIComponent(id)}/attempts`),
    ]);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      item?: RecordsRequest;
      case?: CaseInfo;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.item) {
      throw new Error(data.error || `Failed to load (${res.status})`);
    }
    setItem(data.item);
    setCaseInfo(data.case ?? null);
    setLetterBody(data.item.letterBody ?? "");
    const attemptsData = (await attemptsRes.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: RecordsRequestAttempt[];
    };
    setAttempts(Array.isArray(attemptsData?.items) ? attemptsData.items : []);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false));
  }, [load]);

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterBody }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; item?: RecordsRequest; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Failed to save (${res.status})`);
      }
      if (data.item) setItem(data.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePdf() {
    if (!item) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(id)}/generate-pdf`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; documentId?: string; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Failed to generate (${res.status})`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!sendTo.trim()) {
      setError(sendChannel === "email" ? "Enter email address" : "Enter fax number");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/records-requests/${encodeURIComponent(id)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: sendChannel, to: sendTo.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      setSendOpen(false);
      setSendTo("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p style={{ color: "#666", fontSize: 14 }}>Loading…</p>;
  if (error && !item) return <p style={{ color: "#b91c1c", fontSize: 14 }}>{error}</p>;
  if (!item) return <p style={{ color: "#666", fontSize: 14 }}>Records request not found.</p>;

  const dateRange =
    item.dateFrom || item.dateTo
      ? [item.dateFrom ? formatDate(item.dateFrom) : null, item.dateTo ? formatDate(item.dateTo) : null]
          .filter(Boolean)
          .join(" – ")
      : "All dates";

  const requestLabel = caseInfo
    ? `${item.providerName} · ${caseInfo.caseNumber || caseInfo.clientName || caseInfo.title || "Case"}`
    : item.providerName;

  return (
    <section style={{ maxWidth: 720, margin: "0 auto" }}>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Records Requests", href: "/records-requests" },
          { label: requestLabel },
        ]}
      />

      <PageHeader
        title="Records Request"
        description={`${item.providerName}${caseInfo ? ` · ${caseInfo.caseNumber || caseInfo.clientName || caseInfo.title || "Case"}` : ""}. Edit letter, generate PDF, or send to provider.`}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
          padding: 16,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          background: "#fafafa",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Provider</div>
          <div style={{ fontWeight: 600 }}>{item.providerName}</div>
          {item.providerContact && (
            <div style={{ fontSize: 13, color: "#555" }}>{item.providerContact}</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Case</div>
          {caseInfo ? (
            <Link href={`/cases/${item.caseId}`} style={{ color: "#06c", textDecoration: "underline" }}>
              {caseInfo.caseNumber || caseInfo.clientName || caseInfo.title || item.caseId}
            </Link>
          ) : (
            <span>{item.caseId}</span>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Status</div>
          <span style={{ fontWeight: 600 }}>{item.status}</span>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Date range</div>
          <span>{dateRange}</span>
        </div>
      </div>

      {item.notes && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Notes</div>
          <div style={{ padding: 12, border: "1px solid #e5e5e5", borderRadius: 8, background: "#fff", whiteSpace: "pre-wrap" }}>
            {item.notes}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Letter body</label>
        <textarea
          value={letterBody}
          onChange={(e) => setLetterBody(e.target.value)}
          rows={12}
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid #ccc",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
          }}
          placeholder="Enter or edit the records request letter text…"
        />
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={generating || !letterBody.trim()}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid #666",
            background: "#fff",
            color: "#333",
            fontSize: 14,
            cursor: generating || !letterBody.trim() ? "not-allowed" : "pointer",
          }}
        >
          {generating ? "Generating…" : "Generate PDF"}
        </button>
        {item.status !== "Sent" && (
          <>
            <button
              type="button"
              onClick={() => setSendOpen(!sendOpen)}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #22c55e",
                background: "#22c55e",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Send
            </button>
          </>
        )}
        {item.status === "Sent" && (
          <span style={{ padding: "10px 16px", fontSize: 14, color: "#22c55e", fontWeight: 600 }}>Sent</span>
        )}
      </div>

      {sendOpen && item.status !== "Sent" && (
        <form
          onSubmit={handleSend}
          style={{
            padding: 16,
            marginBottom: 24,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Send records request</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={sendChannel}
              onChange={(e) => setSendChannel(e.target.value as "email" | "fax")}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
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
                borderRadius: 6,
                border: "1px solid #ccc",
                minWidth: 220,
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              disabled={sending}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 14,
                cursor: sending ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setSendOpen(false)}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {item.generatedDocumentId && (
        <div style={{ padding: 16, marginBottom: 24, border: "1px solid #22c55e", borderRadius: 12, background: "#f0fdf4" }}>
          <Link
            href={`/documents/${item.generatedDocumentId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "#16a34a",
              fontWeight: 600,
              textDecoration: "underline",
              fontSize: 14,
            }}
          >
            View generated document →
          </Link>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Delivery attempts</h2>
        {attempts.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>No delivery attempts yet.</p>
        ) : (
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <th style={{ padding: "10px 12px", fontSize: 13 }}>Date</th>
                  <th style={{ padding: "10px 12px", fontSize: 13 }}>Channel</th>
                  <th style={{ padding: "10px 12px", fontSize: 13 }}>Destination</th>
                  <th style={{ padding: "10px 12px", fontSize: 13 }}>Status</th>
                  <th style={{ padding: "10px 12px", fontSize: 13 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>
                      {formatTimestamp(a.createdAt)}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{a.channel}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{a.destination}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>
                      {a.ok ? (
                        <span style={{ color: "#22c55e", fontWeight: 600 }}>Delivered</span>
                      ) : (
                        <span style={{ color: "#b91c1c", fontWeight: 600 }}>Failed</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#b91c1c" }}>
                      {a.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
