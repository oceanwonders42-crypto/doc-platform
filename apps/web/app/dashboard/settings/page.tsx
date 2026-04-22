"use client";

import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

export default function SettingsPage() {
  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }]}
        title="Settings"
        description="Account controls, Clio connection, and firm preferences."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        <DashboardCard title="Account">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            You are signed in. Your firm administrator manages account access and API credentials.
          </p>
          <Link href="/dashboard/support/report" className="onyx-link">
            Contact support
          </Link>
        </DashboardCard>

        <DashboardCard title="Connect to Clio">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Manage the firm’s Clio connection, intake sources, and sync health from one place.
          </p>
          <Link href="/dashboard/integrations" className="onyx-link">
            Open Clio connection
          </Link>
        </DashboardCard>

        <DashboardCard title="Billing">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Review your firm plan, subscription status, and billing contact inside Settings.
          </p>
          <Link href="/dashboard/settings/billing" className="onyx-link">
            Open billing
          </Link>
        </DashboardCard>

        <DashboardCard title="Appearance">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Theme and language can be changed from the controls in the top bar. Your firm administrator manages other display and account settings.
          </p>
        </DashboardCard>
      </div>
    </div>
  );
}
