"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingIntegrationRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/integrations/setup");
  }, [router]);
  return (
    <div className="dashboard-theme" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--onyx-text-muted)" }}>Redirecting to integration setup…</p>
    </div>
  );
}
