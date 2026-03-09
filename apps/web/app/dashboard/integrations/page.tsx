"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import Link from "next/link";
import { useDashboardAuth, canAccessIntegrations } from "@/contexts/DashboardAuthContext";

export default function IntegrationsPage() {
  const { role, checked } = useDashboardAuth();

  if (checked && !canAccessIntegrations(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can manage integrations.
          </p>
          <Link href="/dashboard" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Integrations" }]}
        title="Integrations"
        description="Connected services and firm setup"
      />
      <DashboardCard title="Connected services">
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", marginBottom: "0.5rem" }}>
          Integrations—including case management, document storage, and other connected services—are configured by your firm administrator.
        </p>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          To add a new integration or change existing settings, contact your firm admin.
        </p>
      </DashboardCard>
      <DashboardCard title="Helpful links" style={{ marginTop: "1rem" }}>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          <li style={{ marginBottom: "0.35rem" }}>
            <Link href="/dashboard/settings" className="onyx-link">Settings</Link> — Account and preferences
          </li>
          <li>
            <Link href="/dashboard/integrations/setup" className="onyx-link">Integration setup</Link> — Guided setup for new connections
          </li>
        </ul>
      </DashboardCard>
    </div>
  );
}
