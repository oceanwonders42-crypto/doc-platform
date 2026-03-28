"use client";

import { useState } from "react";
import Link from "next/link";

export default function ProviderLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const base = (process.env.NEXT_PUBLIC_DOC_API_URL || process.env.DOC_API_URL || "http://localhost:4000").replace(
        /\/$/,
        ""
      );
      const res = await fetch(`${base}/provider/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Login failed");
        return;
      }
      window.location.href = "/provider/dashboard";
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "60px auto",
        padding: 24,
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Provider sign in</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Sign in to manage your provider listing.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label htmlFor="email" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 16,
            }}
          />
        </div>
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
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 16,
            }}
          />
        </div>
        {error && (
          <div style={{ color: "#c00", fontSize: 14 }}>{error}</div>
        )}
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
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: 24, fontSize: 14, color: "#666" }}>
        Need an account? Check your email for an invite link from your firm.
      </p>
      <Link href="/provider/invite/accept" style={{ fontSize: 14, color: "#06c", textDecoration: "underline" }}>
        I have an invite link
      </Link>
    </main>
  );
}
