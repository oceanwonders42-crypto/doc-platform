import Link from "next/link";

import { importGitHubRepoAction, syncGitHubAction } from "@/lib/actions/github";
import { deployTypeLabels, environmentLabels } from "@/lib/constants";
import { getProjectsPageData } from "@/lib/data";

import { GitHubSyncBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function ProjectsPage() {
  const data = await getProjectsPageData();

  return (
    <div className="grid gap-6">
      <Panel>
        <SectionHeading
          title="Projects"
          description="Active software projects, linked repositories, and deploy targets."
          actions={
            <>
              <form action={syncGitHubAction}>
                <button type="submit" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-ink">
                  Sync GitHub
                </button>
              </form>
              <LinkButton href="/projects/new" variant="primary">New project</LinkButton>
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-steel">
              <tr>
                <th className="px-5 py-3 font-medium">Project</th>
                <th className="px-5 py-3 font-medium">Repo</th>
                <th className="px-5 py-3 font-medium">GitHub</th>
                <th className="px-5 py-3 font-medium">Deploy type</th>
                <th className="px-5 py-3 font-medium">Environment</th>
                <th className="px-5 py-3 font-medium">Task load</th>
                <th className="px-5 py-3 font-medium">Decisions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.projects.map((project) => {
                const inProgressCount = project.tasks.filter((task) => task.executionStatus === "in_progress").length;
                const blockedCount = project.tasks.filter((task) =>
                  task.executionStatus === "blocked" || task.executionStatus === "failed",
                ).length;

                return (
                  <tr key={project.id} className="bg-white">
                    <td className="px-5 py-4">
                      <Link href={`/projects/${project.slug}`} className="font-medium text-ink hover:text-signal">
                        {project.name}
                      </Link>
                      <p className="mt-1 text-xs text-steel">{project.description}</p>
                    </td>
                    <td className="px-5 py-4">
                      <a href={project.repoUrl} className="text-signal hover:underline" target="_blank" rel="noreferrer">
                        {project.repoName}
                      </a>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <GitHubSyncBadge status={project.githubSyncStatus ?? (project.githubRepoId ? "success" : "error")} />
                        <span className="text-xs text-steel">
                          {project.githubRepoId ? "Linked" : "Manual only"}
                        </span>
                        <span className="text-xs text-steel">
                          {project.lastGithubSyncAt
                            ? `Synced ${new Date(project.lastGithubSyncAt).toLocaleString()}`
                            : "No GitHub sync yet"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">{deployTypeLabels[project.deployType]}</td>
                    <td className="px-5 py-4">{environmentLabels[project.environment]}</td>
                    <td className="px-5 py-4 text-steel">
                      {project._count.tasks} total
                      <div className="mt-1 text-xs">
                        {inProgressCount} in progress, {blockedCount} blocked
                      </div>
                      <div className="mt-1 text-xs">
                        {project.githubOpenIssueCount} issues, {project.githubOpenPrCount} PRs
                      </div>
                    </td>
                    <td className="px-5 py-4">{project._count.decisions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Import GitHub Repositories"
          description={
            data.githubConnection.mode === "mock"
              ? "Fallback mode is active. These repos are mock snapshots until GITHUB_TOKEN and GITHUB_OWNER are configured."
              : "Repositories discovered from GitHub sync that are not yet linked to projects."
          }
        />
        <div className="grid gap-4 p-5">
          {data.importableRepos.length === 0 ? (
            <EmptyState
              title="No importable repos"
              description="Either everything is already linked or GitHub sync has not populated repo snapshots yet."
            />
          ) : (
            data.importableRepos.map((repo) => (
              <div key={repo.githubRepoId} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="font-medium text-signal hover:underline">
                      {repo.fullName}
                    </a>
                    <p className="mt-2 text-sm text-steel">{repo.description ?? "No repository description."}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-steel">
                      <span>{repo.openIssueCount} issues</span>
                      <span>{repo.openPullRequestCount} PRs</span>
                      <span>Default branch: {repo.defaultBranch}</span>
                    </div>
                  </div>
                  <form action={importGitHubRepoAction}>
                    <input type="hidden" name="githubRepoId" value={repo.githubRepoId} />
                    <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white">
                      Import as project
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
