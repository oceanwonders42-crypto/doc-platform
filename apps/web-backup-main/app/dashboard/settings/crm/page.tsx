"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import ApiErrorDisplay from "../../../components/ApiErrorDisplay";
import { statusColors } from "../../../lib/statusColors";

type Settings = { crmWebhookUrl?: string; [key: string]: unknown };

type MappingItem = {
  id: string;
  caseId: string;
  caseNumber: string | null;
  caseTitle: string | null;
  clientName: string | null;
  externalMatterId: string;
  createdAt: string;
};

type ImportRow = {
  caseNumber: string;
  externalMatterId: string;
  status: "created" | "updated" | "not_found";
  caseId?: string;
  caseTitle?: string;
};

type ImportResult = {
  ok: boolean;
  created: number;
  updated: number;
  notFound: number;
  rows: ImportRow[];
};

export default function CrmSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const [mappings, setMappings] = useState<MappingItem[] | null>(null);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchMappings = () => {
    fetch("/api/crm/clio/mappings")
      .then((res) => res.json())
      .then((data: { ok?: boolean; items?: MappingItem[] }) => {
        setMappings(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => setMappings([]))
      .finally(() => setMappingsLoading(false));
  };

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/settings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        return res.json();
      })
      .then((data: Settings) => {
        setSettings(data);
        setWebhookUrl((data.crmWebhookUrl ?? data.crm_webhook_url ?? "") as string);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crmWebhookUrl: webhookUrl.trim() || undefined }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save");
        return res.json();
      })
      .then((data: Settings) => {
        setSettings(data);
        setWebhookUrl((data.crmWebhookUrl ?? "") as string);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setSaving(false));
  };

  const dirty =
    settings != null &&
    (settings.crmWebhookUrl as string | undefined) !== webhookUrl.trim();

  const savedWebhookUrl = (settings?.crmWebhookUrl ?? (settings as { crm_webhook_url?: string })?.crm_webhook_url ?? "").toString().trim();

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    const form = new FormData();
    form.append("file", file);
    fetch("/api/crm/clio/mappings/import", { method: "POST", body: form })
      .then((res) => res.json())
      .then((data: ImportResult & { error?: string }) => {
        if (data.error) {
          setImportError(data.error);
          setImportResult(null);
        } else {
          setImportResult(data);
          fetchMappings();
        }
      })
      .catch((err) => {
        setImportError(err instanceof Error ? err.message : "Import failed");
        setImportResult(null);
      })
      .finally(() => {
        setImporting(false);
        e.target.value = "";
      });
  };

  const handleTest = () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    fetch("/api/crm-push-test", { method: "POST" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setTestResult({ ok: true, message: (data as { message?: string }).message ?? "Test sent." });
        } else {
          setTestResult({ ok: false, message: (data as { error?: string }).error ?? "Request failed" });
        }
      })
      .catch((e) => setTestResult({ ok: false, message: e instanceof Error ? e.message : "Request failed" }))
      .finally(() => {
        setTesting(false);
        setTimeout(() => setTestResult(null), 5000);
      });
  };

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 560,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/dashboard/settings/routing" }, { label: "CRM" }]} />
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>CRM push</h1>

      <p style={{ color: "#666", marginBottom: 20, fontSize: 14 }}>
        When documents are routed or approved, narratives generated, or timeline rebuilt, a Case
        Intelligence Update can be sent to your CRM. Configure a webhook URL to receive these
        messages (e.g. Zapier, Make, or your CRM’s inbound webhook). Enable the{" "}
        <strong>crm_push</strong> feature for your firm to turn on automatic pushes.
      </p>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <LoadingSpinner size={20} />
          <span style={{ color: "#666" }}>Loading…</span>
        </div>
      )}
      {error && (
        <ApiErrorDisplay onRetry={load} retrying={loading} message="Something went wrong loading data." />
      )}
      {saved && <p style={{ color: statusColors.success.text, marginBottom: 12 }}>Settings saved.</p>}

      {!loading && (
        <section
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>
              Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/crm/..."
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 14,
                border: "1px solid #ccc",
                borderRadius: 6,
              }}
            />
            <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "#666" }}>
              POST requests will send JSON: title, bodyMarkdown, caseId, attachments, meta.
            </p>
          </div>

          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !savedWebhookUrl}
            style={{
              marginLeft: dirty ? 12 : 0,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              background: savedWebhookUrl ? statusColors.success.text : "#ccc",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: testing ? "not-allowed" : "pointer",
              opacity: testing ? 0.7 : 1,
            }}
          >
            {testing ? "Sending…" : "Test webhook"}
          </button>
        </section>
      )}

      {testResult && (
        <p style={{ color: testResult.ok ? statusColors.success.text : statusColors.error.text, marginBottom: 12, fontSize: 14 }}>
          {testResult.ok ? testResult.message : testResult.message}
        </p>
      )}

      <p style={{ fontSize: 13, color: "#666", marginBottom: 32 }}>
        Use the <strong>Push update to CRM</strong> button on a case page to send a test message.
      </p>

      {/* Clio Matter ID mappings */}
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Clio Matter ID mappings</h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
          Import a CSV with columns <code>caseNumber</code> and <code>externalMatterId</code> to map
          internal cases to Clio matter IDs. Matches by case number or title.
        </p>

        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <label
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #333",
              background: importing ? "#eee" : "#fff",
              fontSize: 13,
              fontWeight: 500,
              cursor: importing ? "not-allowed" : "pointer",
            }}
          >
            {importing ? "Importing…" : "Upload CSV"}
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCsv}
              disabled={importing}
              style={{ display: "none" }}
            />
          </label>
          {importResult && (
            <span style={{ fontSize: 13, color: statusColors.success.text }}>
              {importResult.created} created, {importResult.updated} updated
              {importResult.notFound > 0 && `, ${importResult.notFound} not found`}
            </span>
          )}
        </div>
        {importError && <p style={{ color: statusColors.error.text, fontSize: 13, marginBottom: 12 }}>{importError}</p>}

        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Mappings</h3>
        {mappingsLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LoadingSpinner size={18} />
            <span style={{ color: "#666", fontSize: 13 }}>Loading…</span>
          </div>
        ) : !mappings || mappings.length === 0 ? (
          <p style={{ color: "#666", fontSize: 13 }}>No mappings yet. Upload a CSV to create mappings.</p>
        ) : (
          <div className="table-scroll-wrapper" style={{ border: "1px solid #eee", borderRadius: 8 }}>
            <table className="dashboard-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <th style={{ padding: "10px 12px" }}>Case #</th>
                  <th style={{ padding: "10px 12px" }}>Title / Client</th>
                  <th style={{ padding: "10px 12px" }}>Clio Matter ID</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <a href={`/cases/${m.caseId}`} style={{ color: "#0066cc", textDecoration: "underline" }}>
                        {m.caseNumber ?? m.caseId.slice(0, 8)}
                      </a>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#555" }}>
                      {m.caseTitle || m.clientName || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>
                      {m.externalMatterId}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 500,
                          background: statusColors.success.bg,
                          color: statusColors.success.text,
                        }}
                      >
                        Mapped
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {importResult && importResult.rows.length > 0 && importResult.notFound > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Not found ({importResult.notFound})</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "#666" }}>
              {importResult.rows
                .filter((r) => r.status === "not_found")
                .slice(0, 10)
                .map((r, i) => (
                  <li key={i}>
                    {r.caseNumber} → {r.externalMatterId}
                  </li>
                ))}
              {importResult.notFound > 10 && (
                <li>… and {importResult.notFound - 10} more</li>
              )}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
