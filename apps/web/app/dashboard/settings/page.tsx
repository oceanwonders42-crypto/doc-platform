"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

export default function SettingsPage() {
  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }]}
        title="Settings"
        description="Your account and preferences"
      />
      <DashboardCard title="Account">
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          You are signed in. Your firm administrator manages account access and API credentials.
        </p>
      </DashboardCard>
      <DashboardCard title="Appearance" style={{ marginTop: "1rem" }}>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          Theme and language can be changed from the controls in the top bar. Your firm administrator manages other display and account settings.
        </p>
      </DashboardCard>
    </div>
  );
}
