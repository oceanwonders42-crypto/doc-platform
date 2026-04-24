"use client";

import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { settingsNavSections } from "./settingsNav";

export default function SettingsPage() {
  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }]}
        title="Settings"
        description="Keep firm profile, team controls, billing, Clio, and API access organized in one scannable workspace."
      />

      <div style={{ display: "grid", gap: "1rem" }}>
        {settingsNavSections.map((section) => (
          <section key={section.title}>
            <div style={{ marginBottom: "0.75rem" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--onyx-text-muted)",
                }}
              >
                {section.title}
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "1rem",
              }}
            >
              {section.items.map((item) => (
                <DashboardCard key={item.href} title={item.label}>
                  <p
                    style={{
                      margin: "0 0 0.9rem",
                      fontSize: "0.875rem",
                      color: "var(--onyx-text-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    {item.description}
                  </p>
                  <Link href={item.href} className="onyx-link">
                    Open {item.label}
                  </Link>
                </DashboardCard>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
