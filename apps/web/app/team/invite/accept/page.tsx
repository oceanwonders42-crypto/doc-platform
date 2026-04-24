"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatApiClientError, getApiBase, getFetchOptions, parseJsonResponse, setAuthToken } from "@/lib/api";
import { ErrorNotice } from "@/components/dashboard/ErrorNotice";

type InviteInfo = {
  email: string;
  role: string;
  firmName: string;
  expiresAt: string;
};

function TeamInviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams?.get("token") ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(tokenFromUrl));
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const base = getApiBase();

  useEffect(() => {
    if (!base) {
      setError("API not configured");
      setLoading(false);
      return;
    }
    if (!tokenFromUrl) return;
    setLoading(true);
    setError(null);
    fetch(`${base}/team/invite/accept?token=${encodeURIComponent(tokenFromUrl)}`, {
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((data: unknown) => {
        const payload = data as { ok?: boolean; invite?: InviteInfo; alreadyJoined?: boolean; error?: string };
        if (payload?.ok && payload.invite) {
          if (payload.alreadyJoined) {
            setError("This invite has already been accepted for this firm.");
            return;
          }
          setInvite(payload.invite);
          setToken(tokenFromUrl);
          return;
        }
        setError(payload?.error ?? "Invite link is invalid or expired.");
      })
      .catch((requestError) => setError(formatApiClientError(requestError, "Failed to load invite.")))
      .finally(() => setLoading(false));
  }, [base, tokenFromUrl]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Invite token is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (!base) {
        setError("API not configured");
        return;
      }
      const res = await fetch(`${base}/team/invite/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        ...getFetchOptions(),
      });
      const payload = (await parseJsonResponse(res)) as {
        ok?: boolean;
        error?: string;
        token?: string;
      };
      if (res.ok && payload.ok && payload.token) {
        setAuthToken(payload.token);
        setAccepted(true);
        setTimeout(() => router.push("/dashboard"), 300);
        return;
      }
      setError(payload.error ?? "Invite acceptance failed.");
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Invite acceptance failed."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div className="onyx-card" style={{ width: "min(100%, 520px)", padding: "1.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-text-muted)" }}>
          Onyx Intel
        </p>
        <h1 style={{ margin: "0.4rem 0 0.75rem", fontSize: "1.85rem" }}>Accept team invite</h1>
        <p style={{ margin: 0, color: "var(--onyx-text-muted)", lineHeight: 1.6 }}>
          Join your firm workspace to work documents, review queues, cases, and exports.
        </p>

        {loading ? <p style={{ marginTop: "1rem", color: "var(--onyx-text-muted)" }}>Loading invite...</p> : null}
        {error ? <ErrorNotice message={error} style={{ marginTop: "1rem" }} /> : null}
        {accepted ? (
          <ErrorNotice tone="success" title="Invite accepted" message="Your account is ready. Redirecting you to the dashboard now." style={{ marginTop: "1rem" }} />
        ) : null}

        {invite && !accepted ? (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.85rem", marginTop: "1.25rem" }}>
            <div className="onyx-card" style={{ padding: "0.9rem 1rem", background: "var(--onyx-surface-subtle)" }}>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                <strong>{invite.email}</strong> will join <strong>{invite.firmName}</strong> as <strong>{invite.role}</strong>.
              </p>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                Expires {new Date(invite.expiresAt).toLocaleString()}
              </p>
            </div>

            <div>
              <label htmlFor="password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                Create password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
                minLength={8}
                required
              />
            </div>

            <div>
              <label htmlFor="confirm-password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
                minLength={8}
                required
              />
            </div>

            <button type="submit" className="onyx-btn-primary" disabled={submitting}>
              {submitting ? "Joining..." : "Join firm"}
            </button>
          </form>
        ) : null}

        <p style={{ margin: "1rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
          Already have access? <Link href="/login" className="onyx-link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function TeamInviteAcceptPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Loading...</div>}>
      <TeamInviteAcceptContent />
    </Suspense>
  );
}
