"use client";

import { useState } from "react";

export default function InviteProviderButton({ providerId }: { providerId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ inviteLink?: string; message?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/providers/${providerId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to send invite");
        return;
      }
      setResult({
        inviteLink: data.inviteLink,
        message: data.message || "Invite sent",
      });
      setEmail("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          padding: "8px 14px",
          fontSize: 14,
          border: "1px solid #ccc",
          borderRadius: 8,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Invite provider account
      </button>
      {open && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Send invite</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            Invite someone to manage this provider listing. They’ll get a link to set a password.
          </p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            {error && <div style={{ color: "#c00", fontSize: 14 }}>{error}</div>}
            {result && (
              <div style={{ fontSize: 14, color: "#0a0" }}>
                {result.message}
                {result.inviteLink && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontWeight: 500 }}>Invite link:</span>{" "}
                    <a href={result.inviteLink} target="_blank" rel="noopener noreferrer" style={{ color: "#06c" }}>
                      {result.inviteLink}
                    </a>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "#111",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Sending…" : "Send invite"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 14px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
