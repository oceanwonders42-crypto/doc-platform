"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

import {
  formatApiClientError,
  getApiBase,
  getApiFetchInit,
  parseJsonResponse,
} from "@/lib/api";

type Mailbox = {
  id: string;
  firm_id: string;
  provider: string;
  imap_username: string | null;
  imap_host: string | null;
  folder: string | null;
  status: string;
  last_uid: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type RecentIngest = {
  id: string;
  documentId: string | null;
  from: string | null;
  subject: string | null;
  receivedAt: string | null;
  status: string;
  mailboxId: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function EmailDashboardPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [recentIngests, setRecentIngests] = useState<RecentIngest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const apiBase = getApiBase();
      const [mbRes, ingRes] = await Promise.all([
        fetch(
          `${apiBase}/mailboxes`,
          getApiFetchInit({ cache: "no-store" })
        ),
        fetch(
          `${apiBase}/mailboxes/recent-ingests?limit=50`,
          getApiFetchInit({ cache: "no-store" })
        ),
      ]);
      const mbData = (await parseJsonResponse(mbRes).catch(() => ({
        ok: false,
        items: [],
      }))) as { ok?: boolean; items?: Mailbox[]; error?: string };
      const ingData = (await parseJsonResponse(ingRes).catch(() => ({
        ok: false,
        items: [],
      }))) as { ok?: boolean; items?: RecentIngest[]; error?: string };

      if (mbData.ok && Array.isArray(mbData.items)) setMailboxes(mbData.items);
      else setMailboxes([]);

      if (ingData.ok && Array.isArray(ingData.items)) setRecentIngests(ingData.items);
      else setRecentIngests([]);

      if (!mbData.ok && mbData.error) setError(mbData.error);
    } catch (e) {
      setError(
        formatApiClientError(e, "Failed to load email intake status.")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTest(mailboxId: string) {
    setTestingId(mailboxId);
    try {
      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/mailboxes/${mailboxId}/test`,
        getApiFetchInit({ method: "POST" })
      );
      const data = (await parseJsonResponse(res).catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (data.ok) {
        await load();
      } else {
        alert(data.error || "Connection failed");
      }
    } catch (e) {
      alert(formatApiClientError(e, "Connection test failed."));
    } finally {
      setTestingId(null);
    }
  }

  async function handleToggleEnabled(mb: Mailbox) {
    const id = mb.id;
    setToggleLoadingId(id);
    try {
      const isActive = mb.status === "active";
      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/mailboxes/${id}`,
        getApiFetchInit({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: isActive ? "paused" : "active" }),
        })
      );
      const data = (await parseJsonResponse(res).catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (data.ok) await load();
      else alert(data.error || "Update failed");
    } catch (e) {
      alert(formatApiClientError(e, "Mailbox update failed."));
    } finally {
      setToggleLoadingId(null);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/dashboard" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Email intake</h1>
      </div>

      {error && (
        <p style={{ color: "#c00", marginBottom: 16 }}>{error}</p>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Mailboxes</h2>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
          {mailboxes.length === 0 ? (
            <p style={{ padding: 16, color: "#666", margin: 0 }}>No mailboxes configured.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f8f8", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Status</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>User / Host</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Folder</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Last sync / error</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mailboxes.map((mb) => (
                  <tr key={mb.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "10px 12px", fontSize: 14 }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          background: mb.status === "active" ? "#e8f5e9" : "#f5f5f5",
                          color: mb.status === "active" ? "#2e7d32" : "#666",
                        }}
                      >
                        {mb.status === "active" ? "Enabled" : "Paused"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 14 }}>
                      <span style={{ fontWeight: 500 }}>{mb.imap_username || "—"}</span>
                      {mb.imap_host && (
                        <span style={{ color: "#666", marginLeft: 6 }}>{mb.imap_host}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 14 }}>{mb.folder || "INBOX"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#666" }}>
                      {mb.last_sync_at ? fmtDate(mb.last_sync_at) : "—"}
                      {mb.last_error && (
                        <div style={{ marginTop: 4, color: "#c00", fontSize: 12 }} title={mb.last_error}>
                          {mb.last_error.slice(0, 60)}{mb.last_error.length > 60 ? "…" : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button
                        type="button"
                        onClick={() => handleTest(mb.id)}
                        disabled={testingId !== null}
                        style={{
                          marginRight: 8,
                          padding: "6px 12px",
                          fontSize: 13,
                          border: "1px solid #ccc",
                          borderRadius: 6,
                          background: "#fff",
                          cursor: testingId ? "not-allowed" : "pointer",
                        }}
                      >
                        {testingId === mb.id ? "Testing…" : "Test connection"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(mb)}
                        disabled={toggleLoadingId !== null}
                        style={{
                          padding: "6px 12px",
                          fontSize: 13,
                          border: "1px solid #ccc",
                          borderRadius: 6,
                          background: "#fff",
                          cursor: toggleLoadingId ? "not-allowed" : "pointer",
                        }}
                      >
                        {toggleLoadingId === mb.id
                          ? "…"
                          : mb.status === "active"
                            ? "Disable"
                            : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Recent ingests</h2>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
          {recentIngests.length === 0 ? (
            <p style={{ padding: 16, color: "#666", margin: 0 }}>No recent ingests.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f8f8", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Document</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>From</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Subject</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Received</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}>Status</th>
                  <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#555" }}></th>
                </tr>
              </thead>
              <tbody>
                {recentIngests.map((ing) => (
                  <tr key={ing.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>
                      <code style={{ background: "#f0f0f0", padding: "2px 6px", borderRadius: 4 }}>
                        {ing.documentId || "—"}
                      </code>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{ing.from || "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, maxWidth: 200 }} title={ing.subject ?? ""}>
                      {(ing.subject || "—").slice(0, 40)}{(ing.subject?.length ?? 0) > 40 ? "…" : ""}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#666" }}>
                      {fmtDate(ing.receivedAt)}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{ing.status}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {ing.documentId ? (
                        <Link
                          href={`/dashboard/documents/${ing.documentId}`}
                          style={{ fontSize: 13, color: "#111", textDecoration: "underline" }}
                        >
                          Open
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
