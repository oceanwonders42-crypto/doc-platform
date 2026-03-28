"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Provider = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  specialty?: string | null;
  specialtiesJson?: unknown;
};

type MeResponse = {
  ok: boolean;
  account: {
    id: string;
    email: string;
    role: string;
    providerId: string;
    provider: Provider;
  };
};

export default function ProviderDashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Partial<Provider>>({});

  const base = (process.env.NEXT_PUBLIC_DOC_API_URL || process.env.DOC_API_URL || "http://localhost:4000").replace(
    /\/$/,
    ""
  );

  useEffect(() => {
    fetch(`${base}/provider/me`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/provider/login";
          return;
        }
        return res.json();
      })
      .then((data) => {
        setMe(data?.ok ? data : null);
        if (data?.account?.provider) {
          setForm({
            name: data.account.provider.name,
            address: data.account.provider.address,
            city: data.account.provider.city,
            state: data.account.provider.state,
            phone: data.account.provider.phone ?? "",
            fax: data.account.provider.fax ?? "",
            email: data.account.provider.email ?? "",
            specialty: data.account.provider.specialty ?? "",
          });
        }
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [base]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${base}/provider/me/provider`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Update failed");
        return;
      }
      setMe((prev) =>
        prev
          ? {
              ...prev,
              account: { ...prev.account, provider: { ...prev.account.provider, ...data } },
            }
          : null
      );
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await fetch(`${base}/provider/auth/logout`, { method: "POST", credentials: "include" });
    window.location.href = "/provider/login";
  }

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 600, margin: "0 auto", fontFamily: "system-ui" }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!me?.ok) {
    return (
      <main style={{ padding: 24, maxWidth: 600, margin: "0 auto", fontFamily: "system-ui" }}>
        <p>Not authenticated.</p>
        <Link href="/provider/login" style={{ color: "#06c", textDecoration: "underline" }}>
          Sign in
        </Link>
      </main>
    );
  }

  const provider = me.account.provider;

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Provider dashboard</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#666" }}>{me.account.email}</span>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <p style={{ color: "#666", marginBottom: 24 }}>
        Manage your listing: <strong>{provider.name}</strong>
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Profile</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Name</label>
              <input
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Address</label>
              <input
                value={form.address ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>City</label>
                <input
                  value={form.city ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>State</label>
                <input
                  value={form.state ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Phone</label>
              <input
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Fax</label>
              <input
                value={form.fax ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Specialty</label>
              <input
                value={form.specialty ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                placeholder="e.g. Orthopedic Surgery"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>
          </div>
        </section>

        {error && <div style={{ color: "#c00", fontSize: 14 }}>{error}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "12px 16px",
            backgroundColor: "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}
