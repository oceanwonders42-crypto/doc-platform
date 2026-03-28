import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

const controlTowerUrl =
  process.env.NEXT_PUBLIC_CONTROL_TOWER_URL?.trim() || "http://127.0.0.1:3400";

export default function ControlTowerEntryPage() {
  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Control Tower" }]}
        title="Control Tower"
        description="Open the integrated operator control tower app for projects, tasks, decisions, prompts, events, and automation jobs."
        action={
          <a
            href={controlTowerUrl}
            target="_blank"
            rel="noreferrer"
            className="onyx-btn-primary"
            style={{ textDecoration: "none" }}
          >
            Open Control Tower
          </a>
        }
      />

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <DashboardCard title="What It Is">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
            The control tower now lives in this monorepo as a separate app at <strong>`apps/control-tower`</strong>.
            It stays isolated from the main case platform runtime so project/task automation features can evolve without
            risking `apps/api` or `apps/web`.
          </p>
        </DashboardCard>

        <DashboardCard title="Local URL">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
            Default local entry point:
          </p>
          <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{controlTowerUrl}</p>
        </DashboardCard>

        <DashboardCard title="Run It">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <code style={{ fontSize: "0.875rem" }}>pnpm control-tower:db:setup</code>
            <code style={{ fontSize: "0.875rem" }}>pnpm control-tower:dev</code>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
              The control tower uses its own SQLite Prisma database and starts on port `3400` by default.
            </p>
          </div>
        </DashboardCard>

        <DashboardCard title="Prisma Boundary">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
            This first integration keeps the control tower schema separate from the main API Postgres schema. That
            avoids destructive model merging while still bringing the app into the monorepo and making it buildable,
            runnable, and discoverable from the main dashboard.
          </p>
        </DashboardCard>
      </div>

      <DashboardCard title="Docs" style={{ marginTop: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
          Integration details, local run steps, and the future shared-database migration plan are documented in
          `docs/control-tower.md` and `apps/control-tower/README.md`.
        </p>
        <Link href="/dashboard" className="onyx-link" style={{ marginRight: "1rem" }}>
          Back to dashboard
        </Link>
      </DashboardCard>
    </div>
  );
}
