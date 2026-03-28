"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MailboxItem = {
  id: string;
  firmId?: string;
  provider?: string;
  imapHost?: string | null;
  imap_host?: string | null;
  imapPort?: number | null;
  imap_port?: number | null;
  imapSecure?: boolean | null;
  imap_secure?: boolean | null;
  imapUsername?: string | null;
  imap_username?: string | null;
  folder?: string | null;
  status?: string | null;
  lastUid?: string | null;
  last_uid?: string | null;
  lastSyncAt?: string | null;
  last_sync_at?: string | null;
  lastError?: string | null;
  last_error?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

function get(m: MailboxItem, key: "host" | "user" | "folder" | "status" | "lastUid" | "lastError" | "lastSyncAt") {
  switch (key) {
    case "host":
      return m.imapHost ?? m.imap_host ?? "—";
    case "user":
      return m.imapUsername ?? m.imap_username ?? "—";
    case "folder":
      return m.folder ?? "INBOX";
    case "status":
      return m.status ?? "—";
    case "lastUid":
      return m.lastUid ?? m.last_uid ?? "—";
    case "lastError":
      return m.lastError ?? m.last_error ?? null;
    case "lastSyncAt": {
      const v = m.lastSyncAt ?? (m as Record<string, unknown>).last_sync_at;
      return v ? new Date(String(v)).toLocaleString() : "Never";
    }
    default:
      return "—";
  }
}

export default function MailboxesPage() {
  const [data, setData] = useState<{ ok?: boolean; error?: string; items?: MailboxItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    imapHost: "",
    imapPort: "993",
    imapSecure: true,
    imapUsername: "",
    imapPassword: "",
    folder: "INBOX",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const fetchMailboxes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mailboxes", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e) {
      setData({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMailboxes();
  }, []);

  const doAction = async (method: string, url: string, body?: unknown) => {
    setActionLoading(url);
    setTestResult(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (url.includes("/test")) {
        const id = url.split("/")[3];
        setTestResult({
          id,
          ok: !!json.ok,
          message: json.ok
            ? `UidValidity: ${json.mailboxUidValidity ?? "—"}, Last UID: ${json.lastUid ?? "—"}`
            : json.error ?? JSON.stringify(json),
        });
      }
      await fetchMailboxes();
    } catch (e) {
      await fetchMailboxes();
    } finally {
      setActionLoading(null);
    }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.imapHost?.trim() || !form.imapUsername?.trim() || !form.imapPassword) {
      setFormError("Host, username, and password are required.");
      return;
    }
    setActionLoading("create");
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imapHost: form.imapHost.trim(),
          imapPort: parseInt(form.imapPort, 10) || 993,
          imapSecure: form.imapSecure,
          imapUsername: form.imapUsername.trim(),
          imapPassword: form.imapPassword,
          folder: form.folder.trim() || "INBOX",
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setFormError(json.error ?? "Failed to create mailbox");
        return;
      }
      setForm({ imapHost: "", imapPort: "993", imapSecure: true, imapUsername: "", imapPassword: "", folder: "INBOX" });
      setFormOpen(false);
      await fetchMailboxes();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const items: MailboxItem[] = Array.isArray(data?.items) ? data.items : [];

  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Mailboxes</h1>

      {loading && <p style={{ marginTop: 8, opacity: 0.8 }}>Loading…</p>}
      {data && !data.ok && (
        <pre style={{ marginTop: 16 }}>{data.error ?? JSON.stringify(data, null, 2)}</pre>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          style={{
            padding: "8px 14px",
            border: "1px solid #333",
            borderRadius: 8,
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          {formOpen ? "Cancel" : "Add mailbox"}
        </button>

        {formOpen && (
          <form
            onSubmit={submitForm}
            style={{
              marginTop: 14,
              padding: 14,
              border: "1px solid #ccc",
              borderRadius: 10,
              maxWidth: 420,
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>IMAP host</label>
              <input
                type="text"
                value={form.imapHost}
                onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))}
                placeholder="imap.gmail.com"
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Port</label>
              <input
                type="text"
                value={form.imapPort}
                onChange={(e) => setForm((f) => ({ ...f, imapPort: e.target.value }))}
                style={{ width: 80, padding: 8 }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.imapSecure}
                  onChange={(e) => setForm((f) => ({ ...f, imapSecure: e.target.checked }))}
                />
                Use SSL/TLS
              </label>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Username</label>
              <input
                type="text"
                value={form.imapUsername}
                onChange={(e) => setForm((f) => ({ ...f, imapUsername: e.target.value }))}
                placeholder="user@example.com"
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Password</label>
              <input
                type="password"
                value={form.imapPassword}
                onChange={(e) => setForm((f) => ({ ...f, imapPassword: e.target.value }))}
                placeholder="App password or account password"
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Folder</label>
              <input
                type="text"
                value={form.folder}
                onChange={(e) => setForm((f) => ({ ...f, folder: e.target.value }))}
                placeholder="INBOX"
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </div>
            {formError && (
              <p style={{ color: "#c00", marginBottom: 10 }}>{formError}</p>
            )}
            <button
              type="submit"
              disabled={actionLoading === "create"}
              style={{
                padding: "8px 14px",
                border: "1px solid #333",
                borderRadius: 8,
                background: "#333",
                color: "#fff",
                cursor: actionLoading === "create" ? "wait" : "pointer",
              }}
            >
              {actionLoading === "create" ? "Creating…" : "Create mailbox"}
            </button>
          </form>
        )}
      </div>

      {testResult && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: `1px solid ${testResult.ok ? "#0a0" : "#c00"}`,
            borderRadius: 8,
            background: testResult.ok ? "#f0fff0" : "#fff0f0",
          }}
        >
          {testResult.ok ? "✓ " : "✗ "}
          {testResult.message}
        </div>
      )}

      <ul style={{ marginTop: 20, listStyle: "none", padding: 0 }}>
        {items.map((m) => (
          <li
            key={m.id}
            style={{
              marginBottom: 14,
              padding: 12,
              border: "1px solid #333",
              borderRadius: 10,
            }}
          >
            <div>
              <b>{get(m, "user")}</b> ({m.provider ?? "imap"}) — <code>{get(m, "status")}</code>
            </div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              host: {get(m, "host")} • folder: {get(m, "folder")} • last poll: {get(m, "lastSyncAt")}
            </div>
            {get(m, "lastError") && (
              <pre
                style={{
                  marginTop: 10,
                  padding: 10,
                  border: "1px solid #444",
                  borderRadius: 8,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  opacity: 0.9,
                  fontSize: 12,
                }}
              >
                {get(m, "lastError")}
              </pre>
            )}
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                disabled={actionLoading !== null}
                onClick={() => doAction("POST", `/api/mailboxes/${m.id}/poll-now`)}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #333",
                  borderRadius: 6,
                  background: "#f5f5f5",
                  cursor: actionLoading ? "wait" : "pointer",
                }}
              >
                {actionLoading === `/api/mailboxes/${m.id}/poll-now` ? "Polling…" : "Poll Now"}
              </button>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: "#fff",
                  cursor: actionLoading ? "wait" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={get(m, "status") === "active"}
                  onChange={() => {
                    const isActive = get(m, "status") === "active";
                    doAction("PATCH", `/api/mailboxes/${m.id}`, { enabled: !isActive });
                  }}
                  disabled={actionLoading !== null}
                />
                {get(m, "status") === "active" ? "Enabled" : "Disabled"}
              </label>
              <button
                type="button"
                disabled={actionLoading !== null}
                onClick={() => doAction("POST", `/api/mailboxes/${m.id}/test`)}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #333",
                  borderRadius: 6,
                  background: "#f5f5f5",
                  cursor: actionLoading ? "wait" : "pointer",
                }}
              >
                {actionLoading === `/api/mailboxes/${m.id}/test` ? "Testing…" : "Test connection"}
              </button>
              <Link
                href={`/mailboxes/${m.id}/recent-ingests`}
                style={{ padding: "6px 10px", color: "#06c" }}
              >
                View recent ingests →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
