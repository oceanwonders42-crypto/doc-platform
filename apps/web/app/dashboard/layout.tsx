"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { I18nProvider } from "@/contexts/I18nContext";
import { DashboardAuthProvider, useDashboardAuth } from "@/contexts/DashboardAuthContext";
import "../globals.css";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { checked, unauthorized, firm, isPlatformAdmin } = useDashboardAuth();

  useEffect(() => {
    if (!checked) return;
    if (unauthorized) {
      router.replace("/login");
      return;
    }
    if (isPlatformAdmin && !firm) {
      router.replace("/admin/quality");
      return;
    }
  }, [checked, unauthorized, isPlatformAdmin, firm, router]);

  if (!checked) {
    return (
      <div
        className="dashboard-theme"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (unauthorized) {
    return null;
  }

  if (isPlatformAdmin && !firm) {
    return null;
  }

  return (
    <I18nProvider>
      <div
        className="dashboard-theme"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <DashboardHeader />
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <DashboardSidebar />
          <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto" }}>
            <div style={{ maxWidth: "var(--onyx-page-max-width)", margin: "0 auto" }}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </I18nProvider>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardAuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardAuthProvider>
  );
}
