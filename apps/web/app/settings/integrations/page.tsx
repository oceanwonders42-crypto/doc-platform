"use client";

import { useEffect, useState } from "react";
import { getApiBase, getAuthHeader, parseJsonResponse } from "../../../lib/api";

type Integration = { id: string; type: string; provider: string; status: string; createdAt: string; updatedAt: string };
type Mailbox = { id: string; emailAddress: string; provider: string; lastSyncAt: string | null; active: boolean };
type SyncLogEntry = { id: string; integrationId: string; eventType: string; status: string; message: string | null; createdAt: string };
type Health = {
  ok: boolean;
  activeIntegrations: number;
  totalIntegrations: number;
  mailboxes: number;
  lastSyncAt: string | null;
  errorCountLast24h: number;
  connections: { id: string; type: string; provider: string; status: string; updatedAt: string }[];
};

export default function SettingsIntegrationsPage() {
  const [status, setStatus] = useState<{ integrations: Integration[]; mailboxes: Mailbox[] } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${getApiBase()}/integrations/status`, { headers: getAuthHeader() }).then(parseJsonResponse),
      fetch(`${getApiBase()}/integrations/health`, { headers: getAuthHeader() }).then(parseJsonResponse),
      fetch(`${getApiBase()}/integrations/sync-log?limit=30`, { headers: getAuthHeader() }).then(parseJsonResponse),
    ])
      .then(([statusRes, healthRes, logRes]) => {
        const status = statusRes as { ok?: boolean; integrations?: Integration[]; mailboxes?: Mailbox[]; error?: string };
        const health = healthRes as { ok?: boolean } & Health;
        const log = logRes as { ok?: boolean; items?: SyncLogEntry[] };
        if (status.ok) setStatus({ integrations: status.integrations ?? [], mailboxes: status.mailboxes ?? [] });
        if (health.ok) setHealth(health as Health);
        if (log.ok) setSyncLog(log.items ?? []);
        if (!status.ok) setError(status.error || "Failed to load status");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, []);

  async function runTest(integrationId: string) {
    setTestingId(integrationId);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/integrations/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ integrationId }),
      });
      const data = await parseJsonResponse(res) as { ok?: boolean; error?: string };
      if (!data.ok) setError(data.error || "Test failed");
      else {
        const [statusRes, healthRes] = await Promise.all([
          fetch(`${getApiBase()}/integrations/status`, { headers: getAuthHeader() }).then(parseJsonResponse),
          fetch(`${getApiBase()}/integrations/health`, { headers: getAuthHeader() }).then(parseJsonResponse),
        ]);
        const s = statusRes as { ok?: boolean; integrations?: Integration[]; mailboxes?: Mailbox[] };
        const h = healthRes as { ok?: boolean } & Health;
        if (s.ok) setStatus({ integrations: s.integrations ?? [], mailboxes: s.mailboxes ?? [] });
        if (h.ok) setHealth(h as Health);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingId(null);
    }
  }

  if (loading) return <p className="p-6">Loading…</p>;
  if (error && !status) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4">{error}</div>
        <p className="mt-2 text-sm text-gray-500">For local: set <code>NEXT_PUBLIC_API_URL=http://localhost:4000</code> in <code>.env.local</code>. Or use window.__API_BASE and window.__API_KEY.</p>
      </div>
    );
  }

  const card = "bg-white border border-gray-200 rounded-lg p-4 shadow-sm";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <h1 className="text-xl font-semibold text-gray-900">Integration settings</h1>
        <p className="text-sm text-gray-500 mt-1">Connected integrations, health, and sync logs</p>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-sm">
            {error}
          </div>
        )}

        {/* Health summary */}
        {health && (
          <section className={card}>
            <h2 className="text-lg font-medium mb-3">Connection health</h2>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              <li>Active integrations: <strong>{health.activeIntegrations}</strong></li>
              <li>Total: <strong>{health.totalIntegrations}</strong></li>
              <li>Mailboxes: <strong>{health.mailboxes}</strong></li>
              <li>Last sync: <strong>{health.lastSyncAt ? new Date(health.lastSyncAt).toLocaleString() : "—"}</strong></li>
              <li>Errors (24h): <strong>{health.errorCountLast24h}</strong></li>
            </ul>
          </section>
        )}

        {/* Connected integrations */}
        <section className={card}>
          <h2 className="text-lg font-medium mb-3">Connected integrations</h2>
          {status?.integrations?.length ? (
            <ul className="space-y-3">
              {status.integrations.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-medium">{i.provider}</span>
                    <span className="text-gray-500 text-sm ml-2">({i.type})</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${i.status === "CONNECTED" ? "bg-green-100 text-green-800" : i.status === "ERROR" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}`}>
                      {i.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => runTest(i.id)}
                    disabled={testingId === i.id}
                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {testingId === i.id ? "Testing…" : "Test"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No integrations yet. <a href="/onboarding/integration" className="text-blue-600 hover:underline">Set up integration</a>.</p>
          )}
        </section>

        {/* Mailboxes */}
        <section className={card}>
          <h2 className="text-lg font-medium mb-3">Mailboxes</h2>
          {status?.mailboxes?.length ? (
            <ul className="space-y-2">
              {status.mailboxes.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span>{m.emailAddress}</span>
                  <span className="text-gray-500">
                    {m.lastSyncAt ? `Last sync: ${new Date(m.lastSyncAt).toLocaleString()}` : "Not synced yet"}
                    {m.active ? "" : " · Paused"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No mailboxes connected.</p>
          )}
        </section>

        {/* Sync log */}
        <section className={card}>
          <h2 className="text-lg font-medium mb-3">Sync log</h2>
          {syncLog.length ? (
            <ul className="space-y-1 text-sm max-h-64 overflow-y-auto">
              {syncLog.map((l) => (
                <li key={l.id} className="flex gap-2 py-1 border-b border-gray-50">
                  <span className="text-gray-500 shrink-0">{new Date(l.createdAt).toLocaleString()}</span>
                  <span className={l.status === "error" ? "text-red-600" : ""}>{l.eventType}</span>
                  <span className="text-gray-500">{l.status}</span>
                  {l.message && <span className="truncate" title={l.message}>{l.message}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No sync events yet.</p>
          )}
        </section>

        <p className="text-sm text-gray-500">
          <a href="/onboarding/integration" className="text-blue-600 hover:underline">Add or reconnect integration</a>.
          Credentials are stored encrypted and never returned to the client.
        </p>
      </main>
    </div>
  );
}
