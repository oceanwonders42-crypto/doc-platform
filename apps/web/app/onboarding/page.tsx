"use client";

import { useState } from "react";
import Link from "next/link";

const STEPS = [
  { id: 1, title: "Create firm", desc: "Name and plan" },
  { id: 2, title: "Create admin user", desc: "Firm admin email" },
  { id: 3, title: "Create API key", desc: "Save it — shown once" },
  { id: 4, title: "Connect mailbox", desc: "IMAP or Gmail" },
  { id: 5, title: "Test ingest", desc: "Upload sample PDF" },
  { id: 6, title: "Success", desc: "Ready for dashboard" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [firm, setFirm] = useState<{ id: string; name: string; plan: string } | null>(null);
  const [firmName, setFirmName] = useState("");
  const [firmPlan, setFirmPlan] = useState("starter");

  const [userEmail, setUserEmail] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [mailbox, setMailbox] = useState({
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    imapUsername: "",
    imapPassword: "",
    folder: "INBOX",
  });

  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const step1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/firms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: firmName.trim(), plan: firmPlan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? "Failed to create firm");
      setFirm(data.firm);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const step2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firm) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/firms/${firm.id}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail.trim(), role: "FIRM_ADMIN" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? "Failed to create user");
      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const step3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firm) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/firms/${firm.id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Onboarding API Key" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? "Failed to create API key");
      setApiKey(data.apiKey ?? "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const step4Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          imapHost: mailbox.imapHost.trim(),
          imapPort: mailbox.imapPort,
          imapSecure: mailbox.imapSecure,
          imapUsername: mailbox.imapUsername.trim(),
          imapPassword: mailbox.imapPassword,
          folder: mailbox.folder.trim() || "INBOX",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? "Failed to connect mailbox");
      setStep(5);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const step5Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !apiKey) return;
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("apiKey", apiKey);
      fd.append("source", "onboarding");
      fd.append("file", uploadFile);

      const res = await fetch("/api/onboarding/ingest", { method: "POST", body: fd });
      const text = await res.text();
      const data = (() => {
        try {
          return JSON.parse(text) as { ok?: boolean; error?: string };
        } catch {
          return {};
        }
      })();
      if (!res.ok) throw new Error((data.error ?? text) || "Upload failed");
      setStep(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/firms" style={{ fontSize: 14, color: "#666", textDecoration: "underline" }}>
          ← Admin
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Firm onboarding</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Set up a new firm in 6 steps.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: step === s.id ? "2px solid #111" : "1px solid #ccc",
              background: step === s.id ? "#f0f0f0" : "#fff",
              cursor: "pointer",
              fontWeight: step === s.id ? 600 : 400,
            }}
          >
            {s.id}. {s.title}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fee", border: "1px solid #c00", borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <form onSubmit={step1Submit}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{STEPS[0].title}</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Firm name</label>
            <input
              type="text"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="Acme Law"
              required
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Plan</label>
            <select
              value={firmPlan}
              onChange={(e) => setFirmPlan(e.target.value)}
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ccc" }}
            >
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <button type="submit" disabled={loading || !firmName.trim()} style={btnStyle}>
            {loading ? "Creating…" : "Create firm"}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={step2Submit}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{STEPS[1].title}</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Admin email</label>
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="admin@firm.com"
              required
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <button type="submit" disabled={loading || !userEmail.trim()} style={btnStyle}>
            {loading ? "Creating…" : "Create user"}
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={step3Submit}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{STEPS[2].title}</h2>
          {apiKey ? (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Save this key now — it won't be shown again:</p>
              <code
                style={{
                  display: "block",
                  padding: 12,
                  background: "#f5f5f5",
                  borderRadius: 8,
                  fontFamily: "monospace",
                  fontSize: 12,
                  wordBreak: "break-all",
                }}
              >
                {apiKey}
              </code>
              <button type="button" onClick={() => setStep(4)} style={{ ...btnStyle, marginTop: 12 }}>
                Continue →
              </button>
            </div>
          ) : (
            <>
              <p style={{ color: "#666", marginBottom: 16 }}>Creates an API key for the firm. Copy and store it securely.</p>
              <button type="submit" disabled={loading} style={btnStyle}>
                {loading ? "Creating…" : "Create API key"}
              </button>
            </>
          )}
        </form>
      )}

      {step === 4 && (
        <form onSubmit={step4Submit}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{STEPS[3].title}</h2>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>IMAP host</label>
            <input
              type="text"
              value={mailbox.imapHost}
              onChange={(e) => setMailbox((m) => ({ ...m, imapHost: e.target.value }))}
              placeholder="imap.gmail.com"
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Port</label>
            <input
              type="number"
              value={mailbox.imapPort}
              onChange={(e) => setMailbox((m) => ({ ...m, imapPort: parseInt(e.target.value, 10) || 993 }))}
              style={{ width: 80, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={mailbox.imapSecure}
                onChange={(e) => setMailbox((m) => ({ ...m, imapSecure: e.target.checked }))}
              />
              Use SSL/TLS
            </label>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Username</label>
            <input
              type="text"
              value={mailbox.imapUsername}
              onChange={(e) => setMailbox((m) => ({ ...m, imapUsername: e.target.value }))}
              placeholder="user@gmail.com"
              required
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Password</label>
            <input
              type="password"
              value={mailbox.imapPassword}
              onChange={(e) => setMailbox((m) => ({ ...m, imapPassword: e.target.value }))}
              placeholder="App password"
              required
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Folder</label>
            <input
              type="text"
              value={mailbox.folder}
              onChange={(e) => setMailbox((m) => ({ ...m, folder: e.target.value }))}
              placeholder="INBOX"
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <button type="submit" disabled={loading || !mailbox.imapUsername.trim() || !mailbox.imapPassword} style={btnStyle}>
            {loading ? "Connecting…" : "Connect mailbox"}
          </button>
        </form>
      )}

      {step === 5 && (
        <form onSubmit={step5Submit}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{STEPS[4].title}</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>Upload a sample PDF to verify ingestion works.</p>
          <div style={{ marginBottom: 16 }}>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button type="submit" disabled={loading || !uploadFile} style={btnStyle}>
            {loading ? "Uploading…" : "Upload sample PDF"}
          </button>
        </form>
      )}

      {step === 6 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>✓ {STEPS[5].title}</h2>
          <p style={{ marginBottom: 16 }}>
            Your firm is ready. Configure the dashboard to use <code>DOC_API_KEY={apiKey ? `${apiKey.slice(0, 12)}...` : "the new API key"}</code> for this firm.
          </p>
          <Link
            href="/dashboard"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#111",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Go to dashboard →
          </Link>
        </div>
      )}
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};
