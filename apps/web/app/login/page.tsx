"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiBase, getFetchOptions, parseJsonResponse, setAuthToken, getAuthHeader } from "@/lib/api";

type LoginResponse = { ok?: boolean; token?: string; error?: string; code?: string };

function isLoginResponse(data: unknown): data is LoginResponse {
  return typeof data === "object" && data !== null;
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const base = getApiBase();
  const apiUrlMissing = !base;

  // Handle OAuth callback: ?token=JWT or ?error=...
  useEffect(() => {
    const token = searchParams?.get("token");
    if (token) {
      setAuthToken(token);
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    const oauthError = searchParams?.get("error");
    if (oauthError === "no_account") {
      setError("No account found for this email. Contact your administrator to get access.");
    } else if (oauthError === "oauth_failed" || oauthError === "oauth_callback_missing_params") {
      setError("Sign-in was cancelled or failed. Try again or use email and password.");
    } else if (oauthError === "oauth_not_implemented") {
      setError("Use email and password to sign in for this demo.");
    }
    if (!base) {
      setCheckingAuth(false);
      return;
    }
    fetch(`${base}/auth/me`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => {
        if (res.ok) router.replace("/dashboard");
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, [base, router, searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (!base) {
      setError(
        "Frontend configuration: API URL is not set. This is not a login or password error. Set NEXT_PUBLIC_API_URL in apps/web/.env.local (e.g. http://localhost:4000) and restart the dev server."
      );
      setLoading(false);
      return;
    }
    fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((data: unknown) => {
        if (!isLoginResponse(data)) {
          setLoading(false);
          return;
        }
        if (data.ok && data.token) {
          setAuthToken(data.token);
          router.push("/dashboard");
          router.refresh();
          return;
        }
        if (data.ok) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        setError(data.error ?? "Login failed");
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? "Request failed");
        setLoading(false);
      });
  };

  const redirectToOAuth = useCallback(
    (provider: "google" | "microsoft") => {
      if (!base) {
        setError(
          "Frontend configuration: API URL is not set. This is not a login or password error. Set NEXT_PUBLIC_API_URL in apps/web/.env.local (e.g. http://localhost:4000) and restart the dev server."
        );
        return;
      }
      const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/login` : "";
      const url = `${base}/auth/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`;
      window.location.href = url;
    },
    [base]
  );

  if (checkingAuth) {
    return (
      <div className="login-page dashboard-theme">
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="login-page dashboard-theme">
      {apiUrlMissing && (
        <div className="onyx-card" style={{ marginBottom: "1rem", padding: "0.75rem 1rem", borderColor: "var(--onyx-warning)", background: "var(--onyx-background-surface)" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text)", fontWeight: 500 }}>Frontend configuration: API URL not set</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            This is not a login or password error. Add <code style={{ fontSize: "0.75rem" }}>NEXT_PUBLIC_API_URL=http://localhost:4000</code> to <code style={{ fontSize: "0.75rem" }}>apps/web/.env.local</code> (copy from <code style={{ fontSize: "0.75rem" }}>.env.local.example</code>) and restart the dev server.
          </p>
        </div>
      )}
      <div className="login-card onyx-card">
        <h1 className="login-title">Onyx Intel</h1>
        <p className="login-subtitle">Sign in to your account</p>

        <div className="login-btn-social" role="button" onClick={() => redirectToOAuth("google")}>
          <GoogleIcon />
          <span>Continue with Google</span>
        </div>
        <div className="login-btn-social" role="button" onClick={() => redirectToOAuth("microsoft")}>
          <MicrosoftIcon />
          <span>Continue with Microsoft</span>
        </div>

        <div className="login-divider">or continue with email</div>

        <form onSubmit={handleSubmit}>
          <div className="login-input-wrap">
            <label htmlFor="email" className="login-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="login-input"
              placeholder="you@firm.com"
            />
          </div>
          <div className="login-input-wrap">
            <label htmlFor="password" className="login-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="login-input"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading} className="login-btn-primary">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login-support-line">Secure access for authorized firm staff only.</p>
        {(typeof window === "undefined" || process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") && (
          <details style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 500 }}>Demo accounts</summary>
            <ul style={{ margin: "0.5rem 0 0 1rem", paddingLeft: "0.5rem" }}>
              <li>owner@onyxintel.com → Platform Admin</li>
              <li>admin@demo.com → Firm Admin</li>
              <li>paralegal@demo.com → Paralegal</li>
              <li>demo@example.com → Staff</li>
            </ul>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>Password: demo</p>
          </details>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="login-page dashboard-theme">
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
