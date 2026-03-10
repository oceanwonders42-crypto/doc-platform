"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions } from "@/lib/api";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const base = getApiBase();
    if (!base) {
      router.replace("/login");
      return;
    }
    fetch(`${base}/auth/me`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { ok?: boolean; role?: string; isPlatformAdmin?: boolean } | null) => {
        if (data?.ok && (data.isPlatformAdmin === true || data.role === "PLATFORM_ADMIN")) {
          setAllowed(true);
        } else {
          setAllowed(false);
        }
      })
      .catch(() => setAllowed(false));
  }, [router]);

  if (allowed === null) {
    return (
      <div className="dashboard-theme" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--onyx-text-muted)" }}>Checking authentication…</p>
      </div>
    );
  }

  if (!allowed) {
    router.replace("/dashboard");
    return null;
  }

  return (
    <div style={{ padding: "1rem", maxWidth: 1200, margin: "0 auto" }}>
      <nav style={{ marginBottom: "1.5rem", borderBottom: "1px solid #e5e7eb", paddingBottom: "0.5rem" }}>
        <Link href="/admin/quality" style={{ marginRight: "1rem" }}>Quality</Link>
        <Link href="/admin/support" style={{ marginRight: "1rem" }}>Support</Link>
        <Link href="/admin/errors" style={{ marginRight: "1rem" }}>Errors</Link>
        <Link href="/admin/incidents" style={{ marginRight: "1rem" }}>Incidents</Link>
        <Link href="/admin/support/bug-reports" style={{ marginRight: "1rem" }}>Bug reports</Link>
        <Link href="/admin/security" style={{ marginRight: "1rem" }}>Security</Link>
      </nav>
      {children}
    </div>
  );
}
