import Link from "next/link";
import { notFound } from "next/navigation";

import { runAutomationJobAction } from "@/lib/actions/automation";
import { deleteProjectAction } from "@/lib/actions/projects";
import { deployTypeLabels, environmentLabels } from "@/lib/constants";
import { getProjectDetailPageData } from "@/lib/data";
import { digitalOceanProvider } from "@/lib/integrations/digitalocean";
import { healthSignalLabel } from "@/lib/runtime-checks";
import { formatDate } from "@/lib/utils";

import { ActivityFeed } from "@/components/activity-feed";
import {
  AgentBadge,
  AutomationJobStatusBadge,
  DecisionStatusBadge,
  ExecutionModeBadge,
  ExecutionStatusBadge,
  GitHubSyncBadge,
  PriorityBadge,
  RuntimeStatusBadge,
} from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

function CommandBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-steel">{label}</p>
      <p className="mt-2 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-ink">
        {value ?? "Not set yet"}
      </p>
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getProjectDetailPageData(slug);

  if (!data) {
    notFound();
  }

  const { project, repoSnapshot, issueSnapshots, pullRequestSnapshots, runtime, githubConnection, githubIntegrationState } = data;
  const digitalOcean = await digitalOceanProvider.getTargetSummary(project);

  const openDecisions = project.decisions.filter((decision) => decision.status === "open");

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel>
          <SectionHeading
            title={project.name}
            description={project.description ?? "Internal project with linked repo and deploy metadata."}
            actions={
              <>
                <form action={runAutomationJobAction}>
                  <input type="hidden" name="action" value="github_sync" />
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="projectSlug" value={project.slug} />
                  <input type="hidden" name="redirectTo" value={`/projects/${project.slug}`} />
                  <input type="hidden" name="scopeLabel" value={project.name} />
                  <button type="submit" className="inline-flex items-center rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-ink">
                    Refresh GitHub
                  </button>
                </form>
                <form action={runAutomationJobAction}>
                  <input type="hidden" name="action" value="runtime_refresh" />
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="projectSlug" value={project.slug} />
                  <input type="hidden" name="redirectTo" value={`/projects/${project.slug}`} />
                  <input type="hidden" name="scopeLabel" value={project.name} />
                  <button type="submit" className="inline-flex items-center rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
                    Refresh runtime
                  </button>
                </form>
                <LinkButton href={`/projects/${project.slug}/edit`}>Edit</LinkButton>
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white"
                >
                  Open repo
                </a>
              </>
            }
          />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="grid gap-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Repository</p>
                <p className="mt-2 text-lg font-semibold text-ink">{project.repoName}</p>
                <p className="mt-1 text-sm text-steel">Default branch: {project.defaultBranch}</p>
                <p className="mt-1 text-sm text-steel">Public URL: {project.publicUrl ?? "Not set yet"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Deploy Metadata</p>
                <div className="mt-3 grid gap-2 text-sm text-ink">
                  <p>Deploy type: {deployTypeLabels[project.deployType]}</p>
                  <p>Environment: {environmentLabels[project.environment]}</p>
                  <p>Deploy target: {project.deployTargetName}</p>
                  <p>Target host / id: {project.deployTargetIdOrHost}</p>
                  <p>Deploy mode: {project.deployMode ?? "Not set yet"}</p>
                  <p>Process manager: {project.processManager ?? "Not set yet"}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Container / Health</p>
                <div className="mt-3 grid gap-2 text-sm text-ink">
                  <p>Container image: {project.containerImage ?? "Not set yet"}</p>
                  <p>Registry: {project.containerRegistryUrl ?? "Not set yet"}</p>
                  <p>Health check: {project.healthCheckUrl ?? "Not set yet"}</p>
                  <p>Internal API: {project.internalApiUrl ?? "Not set yet"}</p>
                  <p>Healthz: {project.internalApiHealthzUrl ?? "Not set yet"}</p>
                  <p>Dockerfile: {project.dockerfileStatus ?? "Not set yet"}</p>
                  <p>Compose usage: {project.composeUsage ?? "Not set yet"}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Access / Runtime</p>
                <div className="mt-3 grid gap-2 text-sm text-ink">
                  <p>SSH host: {project.sshHost ?? "Not set yet"}</p>
                  <p>SSH port: {project.sshPort ?? "Not set yet"}</p>
                  <p>SSH user: {project.sshUser ?? "Not set yet"}</p>
                  <p>App path: {project.appPath ?? "Not set yet"}</p>
                  <p>Runtime services: {project.runtimeServices ?? "Not set yet"}</p>
                  <p>API PM2 target: {project.apiServiceName ?? "Not set yet"} {typeof project.apiServiceId === "number" ? `(id ${project.apiServiceId})` : ""}</p>
                  <p>Web PM2 target: {project.webServiceName ?? "Not set yet"} {typeof project.webServiceId === "number" ? `(id ${project.webServiceId})` : ""}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-700">GitHub</p>
                  <GitHubSyncBadge status={project.githubSyncStatus ?? githubConnection.mode} />
                </div>
                <p className="mt-2 text-sm text-ink">Owner: {githubConnection.owner ?? "not configured"}</p>
                <p className="mt-1 text-sm text-ink">Open PRs: {project.githubOpenPrCount}</p>
                <p className="mt-1 text-sm text-ink">Open issues: {project.githubOpenIssueCount}</p>
                <p className="mt-1 text-sm text-blue-700">
                  {project.lastGithubSyncAt
                    ? `Last sync ${new Date(project.lastGithubSyncAt).toLocaleString()}`
                    : "No GitHub sync yet"}
                </p>
                {project.githubSyncError ? (
                  <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-rose-700">{project.githubSyncError}</p>
                ) : null}
                {githubIntegrationState?.lastSyncMessage ? (
                  <p className="mt-3 text-sm text-ink">{githubIntegrationState.lastSyncMessage}</p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">DigitalOcean Adapter</p>
                <p className="mt-2 text-sm text-ink">Target: {digitalOcean.targetLabel}</p>
                <p className="mt-1 text-sm text-ink">Status: {digitalOcean.status}</p>
                <p className="mt-1 text-sm text-ink">Mode: {digitalOcean.deployMode}</p>
                <p className="mt-1 text-sm text-emerald-700">{digitalOcean.lastDeployLabel}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Runtime Status</p>
                  <RuntimeStatusBadge status={runtime.overallStatus} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <RuntimeStatusBadge status={healthSignalLabel("api", runtime.apiHealthy, runtime.details)} />
                  <RuntimeStatusBadge status={healthSignalLabel("web", runtime.webHealthy, runtime.details)} />
                  <RuntimeStatusBadge status={healthSignalLabel("public", runtime.publicHealthy, runtime.details)} />
                </div>
                <div className="mt-3 grid gap-2 text-sm text-ink">
                  <p>API: {runtime.details?.api?.summary ?? (runtime.apiHealthy ? "Healthy" : "Unknown")}</p>
                  <p>Web: {runtime.details?.web?.summary ?? (runtime.webHealthy ? "Healthy" : "Unknown")}</p>
                  <p>Public: {runtime.details?.public?.summary ?? (runtime.publicHealthy ? "Healthy" : "Unknown")}</p>
                  <p>
                    Last runtime check:{" "}
                    {runtime.checkedAt ? runtime.checkedAt.toLocaleString() : "No runtime check recorded yet"}
                  </p>
                </div>
                {runtime.reason ? (
                  <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-amber-800">{runtime.reason}</p>
                ) : null}
                {runtime.details?.cause ? (
                  <p className="mt-2 text-sm text-ink">Cause: {runtime.details.cause}</p>
                ) : null}
                {runtime.details?.web?.logHint ? (
                  <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-ink">Web log signal: {runtime.details.web.logHint}</p>
                ) : null}
                {runtime.details?.recommendedAction ? (
                  <p className="mt-2 text-sm text-ink">Recommended next step: {runtime.details.recommendedAction}</p>
                ) : null}
                {runtime.details?.pm2Summary ? (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-amber-700">PM2 summary</p>
                    <pre className="mt-2 overflow-x-auto rounded-xl bg-white px-3 py-2 text-xs text-ink">{runtime.details.pm2Summary}</pre>
                  </div>
                ) : null}
                {runtime.details?.pm2Services?.length ? (
                  <div className="mt-3 grid gap-2">
                    {runtime.details.pm2Services.map((service) => (
                      <div key={`${service.name}-${service.id ?? "na"}`} className="rounded-xl bg-white px-3 py-2 text-sm text-ink">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">
                            {service.name}
                            {typeof service.id === "number" ? ` (${service.id})` : ""}
                          </p>
                          <RuntimeStatusBadge status={service.status} />
                        </div>
                        <p className="mt-2 text-sm text-steel">{service.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Operator Commands</p>
                <div className="mt-3 grid gap-3">
                  <CommandBlock label="Deploy" value={project.deployCommand} />
                  <CommandBlock label="Restart" value={project.restartCommand} />
                  <CommandBlock label="Logs" value={project.logCommand} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Runtime Actions</p>
                <div className="mt-3 grid gap-2">
                  {runtime.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={!action.enabled}
                      title={action.description}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-steel opacity-70"
                    >
                      <span className="font-medium text-ink">{action.label}</span>
                      <span className="mt-1 block text-xs text-steel">{action.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Safe Automation Jobs</p>
                <div className="mt-3 grid gap-3">
                  <form action={runAutomationJobAction}>
                    <input type="hidden" name="action" value="task_status_reconcile" />
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="projectSlug" value={project.slug} />
                    <input type="hidden" name="redirectTo" value={`/projects/${project.slug}`} />
                    <input type="hidden" name="scopeLabel" value={project.name} />
                    <button type="submit" className="w-full rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-ink">
                      Reconcile linked tasks
                    </button>
                  </form>
                  <form action={runAutomationJobAction}>
                    <input type="hidden" name="action" value="project_health_reconcile" />
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="projectSlug" value={project.slug} />
                    <input type="hidden" name="redirectTo" value={`/projects/${project.slug}`} />
                    <input type="hidden" name="scopeLabel" value={project.name} />
                    <button type="submit" className="w-full rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-ink">
                      Reconcile project health
                    </button>
                  </form>
                  {project.automationJobs.length === 0 ? (
                    <p className="text-sm text-steel">No safe jobs have run for this project yet.</p>
                  ) : (
                    project.automationJobs.map((job) => (
                      <div key={job.id} className="rounded-xl bg-slate-50 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-ink">{job.action}</p>
                          <AutomationJobStatusBadge status={job.status} />
                        </div>
                        <p className="mt-2 text-xs text-steel">{job.message ?? "Operator-triggered job."}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <form action={deleteProjectAction} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <input type="hidden" name="id" value={project.id} />
                <input type="hidden" name="slug" value={project.slug} />
                <input type="hidden" name="name" value={project.name} />
                <p className="text-sm text-rose-700">
                  Delete this project if it should leave the control tower. Tasks and decisions will be removed too.
                </p>
                <button type="submit" className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white">
                  Delete project
                </button>
              </form>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="GitHub Activity" description="Cached issues and pull requests from the latest manual sync." />
          <div className="grid gap-4 p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-steel">Repository snapshot</p>
              <p className="mt-2 text-sm text-ink">{repoSnapshot?.fullName ?? project.repoName}</p>
              <p className="mt-1 text-sm text-steel">
                {repoSnapshot?.description ?? "No synced repository snapshot yet."}
              </p>
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-ink">Open issues</p>
                {issueSnapshots.length === 0 ? (
                  <p className="mt-2 text-sm text-steel">No open issues in the latest sync.</p>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {issueSnapshots.map((issue) => (
                      <div key={issue.githubIssueId} className="rounded-xl bg-slate-50 px-3 py-3">
                        <a href={issue.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-signal hover:underline">
                          #{issue.number} {issue.title}
                        </a>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-steel">
                          <span>{issue.state}</span>
                          <span>{issue.authorLogin ?? "unknown author"}</span>
                          <span>{new Date(issue.issueUpdatedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-ink">Open pull requests</p>
                {pullRequestSnapshots.length === 0 ? (
                  <p className="mt-2 text-sm text-steel">No open pull requests in the latest sync.</p>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {pullRequestSnapshots.map((pullRequest) => (
                      <div key={pullRequest.githubPullRequestId} className="rounded-xl bg-slate-50 px-3 py-3">
                        <a href={pullRequest.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-signal hover:underline">
                          #{pullRequest.number} {pullRequest.title}
                        </a>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-steel">
                          <span>{pullRequest.state}</span>
                          <span>{pullRequest.authorLogin ?? "unknown author"}</span>
                          <span>{pullRequest.headRefName ?? "no branch"}</span>
                          <span>{new Date(pullRequest.pullRequestUpdatedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeading title="Open Decisions" description="Choices currently tied to this project." />
        <div className="grid gap-4 p-5">
          {openDecisions.length === 0 ? (
            <EmptyState title="No open decisions" description="This project is not waiting on an unresolved choice." />
          ) : (
            openDecisions.map((decision) => (
              <div key={decision.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <DecisionStatusBadge status={decision.status} />
                <p className="mt-3 font-medium text-ink">{decision.title}</p>
                <p className="mt-2 text-sm text-steel">{decision.description}</p>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Tasks"
          description="Operational task execution tied to this project, its GitHub state, and runtime truth."
          actions={<LinkButton href={`/tasks?projectId=${project.id}`}>View on board</LinkButton>}
        />
        <div className="grid gap-4 p-5">
          {project.tasks.length === 0 ? (
            <EmptyState title="No tasks yet" description="Create a task from the dashboard or task board." />
          ) : (
            project.tasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ExecutionStatusBadge status={task.executionStatus} />
                  <ExecutionModeBadge mode={task.executionMode} />
                  <PriorityBadge priority={task.priority} />
                  <AgentBadge agent={task.assignedAgent} />
                </div>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{task.title}</p>
                    {task.description ? <p className="mt-2 text-sm text-steel">{task.description}</p> : null}
                    {task.nextStep ? <p className="mt-2 text-sm text-ink">Next: {task.nextStep}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-steel">
                      {task.linkedGithubIssueNumber ? <span>Issue #{task.linkedGithubIssueNumber}</span> : null}
                      {task.linkedGithubPrNumber ? <span>PR #{task.linkedGithubPrNumber}</span> : null}
                      {task.linkedGithubBranch ? <span>{task.linkedGithubBranch}</span> : null}
                      {task.lastExternalUpdateAt ? <span>External {new Date(task.lastExternalUpdateAt).toLocaleString()}</span> : null}
                    </div>
                    {task.blockedReason ? (
                      <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{task.blockedReason}</p>
                    ) : null}
                    {task.events[0] ? <p className="mt-2 text-xs text-steel">{task.events[0].message}</p> : null}
                  </div>
                  <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-signal hover:underline">
                    Open
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Recent Activity" description={`Updated ${formatDate(project.updatedAt)}.`} />
        <ActivityFeed
          items={project.activities.map((activity) => ({
            id: activity.id,
            type: activity.type,
            message: activity.message,
            createdAt: activity.createdAt,
            project: { slug: project.slug, name: project.name },
          }))}
        />
      </Panel>
    </div>
  );
}
