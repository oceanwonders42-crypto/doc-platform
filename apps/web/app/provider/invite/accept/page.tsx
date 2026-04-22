"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ProviderInviteAcceptContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams?.get("token") || "";
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{
    email: string;
    providerName: string;
    providerId: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const base = (process.env.NEXT_PUBLIC_DOC_API_URL || process.env.DOC_API_URL || "http://localhost:4000").replace(
    /\/$/,
    ""
  );

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      fetch(`${base}/provider/invite/accept?token=${encodeURIComponent(tokenFromUrl)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.ok) {
            setInviteInfo({ email: data.email, providerName: data.providerName, providerId: data.providerId });
          } else {
            setError(data?.error || "Invalid invite");
          }
        })
        .catch(() => setError("Failed to load invite"));
    }
  }, [tokenFromUrl, base]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    const t = token.trim();
    if (!t) {
      setError("Invite token is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${base}/provider/invite/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to create account");
        return;
      }
      setSubmitted(true);
      window.location.href = "/provider/dashboard";
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (tokenFromUrl && !inviteInfo && !error) {
    return (
      <main style={{ padding: 24, maxWidth: 400, margin: "60px auto", fontFamily: "system-ui" }}>
        <p>Loading invite…</p>
      </main>
    );
  }

  if (!tokenFromUrl && !inviteInfo) {
    return (
      <main style={{ padding: 24, maxWidth: 400, margin: "60px auto", fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Accept invite</h1>
        <p style={{ color: "#666", marginBottom: 16 }}>
          Paste your invite link or enter the token from the link.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = token.trim();
            if (t) {
              window.location.href = `/provider/invite/accept?token=${encodeURIComponent(t)}`;
            } else {
              setError("Please enter a token");
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token from invite link"
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 16,
            }}
          />
          {error && <div style={{ color: "#c00", fontSize: 14 }}>{error}</div>}
          <button
            type="submit"
            style={{
              padding: "12px 16px",
              backgroundColor: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  if (error && !inviteInfo) {
    return (
      <main style={{ padding: 24, maxWidth: 400, margin: "60px auto", fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Invalid invite</h1>
        <p style={{ color: "#666", marginBottom: 16 }}>{error}</p>
        <Link href="/provider/login" style={{ color: "#06c", textDecoration: "underline" }}>
          Back to sign in
        </Link>
      </main>
    );
  }

  if (submitted) {
    return (
      <main style={{ padding: 24, maxWidth: 400, margin: "60px auto", fontFamily: "system-ui" }}>
        <p>Account created. Redirecting to dashboard…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 400, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Create your account</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        You’re joining <strong>{inviteInfo?.providerName}</strong>. Set a password to continue.
      </p>
      {inviteInfo && (
        <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>
          Email: <strong>{inviteInfo.email}</strong>
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label htmlFor="password" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 16,
            }}
          />
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>At least 8 characters</p>
        </div>
        <div>
          <label htmlFor="confirm" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 16,
            }}
          />
        </div>
        {error && <div style={{ color: "#c00", fontSize: 14 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 16px",
            backgroundColor: "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </main>
  );
}

export default function ProviderInviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, maxWidth: 400, margin: "60px auto", fontFamily: "system-ui" }}>
          <p>Loading…</p>
        </main>
      }
    >
      <ProviderInviteAcceptContent />
    </Suspense>
  );
}
