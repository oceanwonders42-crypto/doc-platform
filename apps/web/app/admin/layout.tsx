"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions } from "@/lib/api";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const base = getApiBase();
    if (!base) {
      router.replace("/login");
      return;
    }
    fetch(`${base}/auth/me`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => {
        if (res.ok) setAllowed(true);
        else router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!allowed) {
    return (
      <div className="dashboard-theme" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--onyx-text-muted)" }}>Checking authentication…</p>
      </div>
    );
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
