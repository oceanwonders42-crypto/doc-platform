import { syncGitHubAction } from "@/lib/actions/github";
import { getSettingsPageData } from "@/lib/data";

import { GitHubSyncBadge } from "@/components/status-badge";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export const dynamic = "force-dynamic";

const sections = [
  {
    title: "DigitalOcean integration",
    description:
      "Planned hooks: droplet metadata, App Platform status, deployment log links. Future secret: DIGITALOCEAN_TOKEN.",
  },
  {
    title: "Codex workflow",
    description:
      "Use task assignment plus branch and PR links now. Next pass can add task handoff prompts and completion callbacks.",
  },
  {
    title: "Claude workflow",
    description:
      "Use decision items and review-stage tasks now. Next pass can add planning/review templates and summary sync.",
  },
  {
    title: "Cursor workflow",
    description:
      "Use assigned-agent plus next-step context now. Next pass can add fix/debug session handoff structure.",
  },
  {
    title: "Docker and deploy conventions",
    description:
      "Docker-first local workflow is included. Deployment modes documented in README: local compose, droplet SSH compose, App Platform container image.",
  },
];

export default async function SettingsPage() {
  const data = await getSettingsPageData();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel>
        <SectionHeading
          title="GitHub integration"
          description="Personal access token and owner-based first-pass sync for repositories, issues, and pull requests."
          actions={
            <form action={syncGitHubAction}>
              <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white">
                Sync now
              </button>
            </form>
          }
        />
        <div className="grid gap-4 px-5 pb-5 text-sm text-steel">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink">Connection status</p>
              <GitHubSyncBadge status={data.githubIntegrationState?.status ?? data.githubConnection.mode} />
            </div>
            <div className="mt-3 grid gap-2">
              <p>Mode: {data.githubConnection.mode}</p>
              <p>Owner: {data.githubConnection.owner ?? "missing"}</p>
              <p>Token: {data.githubConnection.tokenConfigured ? "configured" : "missing"}</p>
              <p>API base URL: {data.githubConnection.apiBaseUrl}</p>
            </div>
            <p className="mt-3 text-sm text-ink">{data.githubConnection.message}</p>
            {data.githubIntegrationState?.lastSyncError ? (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {data.githubIntegrationState.lastSyncError}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="font-medium text-ink">Latest sync</p>
            <div className="mt-3 grid gap-2">
              <p>
                Last sync time:{" "}
                {data.githubIntegrationState?.lastSyncAt
                  ? new Date(data.githubIntegrationState.lastSyncAt).toLocaleString()
                  : "not run yet"}
              </p>
              <p>Status: {data.githubIntegrationState?.status ?? "not run yet"}</p>
              <p>Repos cached: {data.githubRepoCount}</p>
              <p>Linked projects: {data.linkedProjectCount}</p>
              <p>Cached issues: {data.githubIssueCount}</p>
              <p>Cached PRs: {data.githubPullRequestCount}</p>
            </div>
            {data.githubIntegrationState?.lastSyncMessage ? (
              <p className="mt-3 text-sm text-ink">{data.githubIntegrationState.lastSyncMessage}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="font-medium text-ink">Environment setup</p>
            <div className="mt-3 grid gap-2 text-sm text-steel">
              <p>`GITHUB_TOKEN` should be a GitHub personal access token with repo read access.</p>
              <p>`GITHUB_OWNER` should be the org or user to sync.</p>
              <p>`GITHUB_API_BASE_URL` is optional and defaults to GitHub Cloud.</p>
              <p>If token or owner is missing, the app stays usable in mock fallback mode.</p>
            </div>
          </div>
        </div>
      </Panel>

      {sections.map((section) => (
        <Panel key={section.title}>
          <SectionHeading title={section.title} />
          <div className="px-5 pb-5 text-sm text-steel">
            <p>{section.description}</p>
          </div>
        </Panel>
      ))}
    </div>
  );
}
