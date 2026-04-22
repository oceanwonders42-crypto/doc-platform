"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SupportReportRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/support/report");
  }, [router]);
  return (
    <div className="dashboard-theme" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--onyx-text-muted)" }}>Redirecting…</p>
    </div>
  );
}
