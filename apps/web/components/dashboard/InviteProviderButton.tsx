"use client";

import { useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

type InviteResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  inviteLink?: string;
};

export function InviteProviderButton({ providerId, defaultEmail = "" }: { providerId: string; defaultEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResponse | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${getApiBase()}/providers/${providerId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await parseJsonResponse(response)) as InviteResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Failed to send invite.");
        return;
      }
      setResult(data);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((current) => !current)} className="onyx-btn-secondary">
        {open ? "Hide invite" : "Invite provider account"}
      </button>

      {open && (
        <div
          className="onyx-card"
          style={{
            marginTop: "1rem",
            padding: "1rem 1.125rem",
            borderColor: "var(--onyx-border-subtle)",
            background: "var(--onyx-background-surface)",
          }}
        >
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
            Send an invite so the provider can manage this listing. In development, the API returns a direct invite link.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div>
              <label htmlFor="provider-invite-email" style={{ display: "block", marginBottom: "0.375rem", fontSize: "0.8125rem", fontWeight: 500, color: "var(--onyx-text-muted)" }}>
                Invite email
              </label>
              <input
                id="provider-invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
                required
              />
            </div>

            {error && <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-error)" }}>{error}</p>}

            {result && (
              <div
                className="onyx-card"
                style={{
                  padding: "0.875rem 1rem",
                  borderColor: "var(--onyx-success)",
                  background: "rgba(34, 197, 94, 0.08)",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500, color: "var(--onyx-success)" }}>
                  {result.message ?? "Invite created."}
                </p>
                {result.inviteLink && (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", lineHeight: 1.45 }}>
                    Invite link: <a href={result.inviteLink} target="_blank" rel="noopener noreferrer" className="onyx-link">{result.inviteLink}</a>
                  </p>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="submit" disabled={loading} className="onyx-btn-primary">
                {loading ? "Sending..." : "Send invite"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="onyx-btn-secondary">
                Close
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
