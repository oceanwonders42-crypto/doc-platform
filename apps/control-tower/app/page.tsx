import Link from "next/link";

import { runAutomationJobAction } from "@/lib/actions/automation";
import { createTaskAction } from "@/lib/actions/tasks";
import {
  agentLabels,
  agentOptions,
  automationActionLabels,
  executionModeLabels,
  executionModeOptions,
  executionStatusLabels,
  executionStatusOptions,
} from "@/lib/constants";
import { getDashboardData } from "@/lib/data";
import { healthSignalLabel } from "@/lib/runtime-checks";

import { ActivityFeed } from "@/components/activity-feed";
import {
  AgentBadge,
  AutomationJobStatusBadge,
  ExecutionModeBadge,
  ExecutionStatusBadge,
  PriorityBadge,
  RuntimeStatusBadge,
} from "@/components/status-badge";
import { SummaryCard } from "@/components/summary-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form-inputs";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const executionStatus = readParam(params.executionStatus);
  const agent = readParam(params.agent);
  const data = await getDashboardData({
    executionStatus: executionStatus as never,
    agent: agent as never,
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 xl:grid-cols-5">
        <SummaryCard label="Active projects" value={data.summary.activeProjects} />
        <SummaryCard label="Tasks running" value={data.summary.tasksInProgress} />
        <SummaryCard label="Blocked or failed" value={data.summary.blockedTasks} tone="alert" />
        <SummaryCard label="Open decisions" value={data.summary.openDecisions} tone="alert" />
        <SummaryCard label="Completed this week" value={data.summary.completedThisWeek} tone="success" />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryCard label="Open GitHub issues" value={data.summary.githubOpenIssues} />
        <SummaryCard label="Open GitHub PRs" value={data.summary.githubOpenPrs} />
        <SummaryCard label="Projects missing repo links" value={data.summary.projectsMissingRepoLinks} tone="alert" />
        <SummaryCard label="Runtime degraded" value={data.summary.degradedRuntimeProjects} tone="alert" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <Panel>
          <SectionHeading
            title="Live Execution Queue"
            description="Tasks currently waiting, running, blocked, or in review based on persisted execution state."
            actions={<LinkButton href="/tasks">Open task board</LinkButton>}
          />
          <div className="grid gap-4 p-5">
            <form className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-3">
              <Field label="Execution status" htmlFor="executionStatus">
                <Select id="executionStatus" name="executionStatus" defaultValue={executionStatus ?? ""}>
                  <option value="">All execution states</option>
                  {executionStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {executionStatusLabels[option]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Agent" htmlFor="agent">
                <Select id="agent" name="agent" defaultValue={agent ?? ""}>
                  <option value="">All agents</option>
                  {agentOptions.map((option) => (
                    <option key={option} value={option}>
                      {agentLabels[option]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end gap-3">
                <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white">
                  Apply filters
                </button>
                <Link href="/" className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink">
                  Reset
                </Link>
              </div>
            </form>

            {data.needsAttention.length === 0 ? (
              <EmptyState
                title="Execution queue is clear"
                description="Nothing is blocked, waiting externally, or waiting for review with the current filters."
              />
            ) : (
              <div className="grid gap-4">
                {data.needsAttention.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <ExecutionStatusBadge status={task.executionStatus} />
                          <ExecutionModeBadge mode={task.executionMode} />
                          <PriorityBadge priority={task.priority} />
                          <AgentBadge agent={task.assignedAgent} />
                        </div>
                        <p className="mt-3 text-lg font-semibold text-ink">{task.title}</p>
                        <p className="mt-1 text-sm text-steel">{task.project.name}</p>
                        {task.description ? <p className="mt-3 text-sm text-steel">{task.description}</p> : null}
                        {task.blockedReason ? (
                          <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{task.blockedReason}</p>
                        ) : null}
                        {task.nextStep ? (
                          <p className="mt-3 text-sm text-ink">
                            <span className="font-medium">Next:</span> {task.nextStep}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <LinkButton href={`/projects/${task.project.slug}`}>Project</LinkButton>
                        <LinkButton href={`/tasks/${task.id}`} variant="primary">
                          Open task
                        </LinkButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <div className="grid gap-6">
          <Panel>
            <SectionHeading title="Quick Add Task" description="Create executable work with an explicit mode and live status." />
            <form action={createTaskAction} className="grid gap-4 p-5">
              <input type="hidden" name="redirectTo" value="/" />
              <input type="hidden" name="status" value="ready" />
              <Field label="Title" htmlFor="dashboard-title">
                <Input id="dashboard-title" name="title" placeholder="Ship the next real task" required />
              </Field>
              <Field label="Project" htmlFor="dashboard-project">
                <Select id="dashboard-project" name="projectId" defaultValue={data.projects[0]?.id}>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Execution mode" htmlFor="dashboard-mode">
                  <Select id="dashboard-mode" name="executionMode" defaultValue="manual">
                    {executionModeOptions.map((option) => (
                      <option key={option} value={option}>
                        {executionModeLabels[option]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Execution status" htmlFor="dashboard-execution-status">
                  <Select id="dashboard-execution-status" name="executionStatus" defaultValue="queued">
                    {executionStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {executionStatusLabels[option]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Agent" htmlFor="dashboard-agent">
                  <Select id="dashboard-agent" name="assignedAgent" defaultValue="codex">
                    {agentOptions.map((option) => (
                      <option key={option} value={option}>
                        {agentLabels[option]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Priority" htmlFor="dashboard-priority">
                  <Select id="dashboard-priority" name="priority" defaultValue="medium">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                </Field>
                <Field label="Next step" htmlFor="dashboard-next-step">
                  <Input id="dashboard-next-step" name="nextStep" placeholder="Capture the next concrete move" />
                </Field>
              </div>
              <label className="flex items-center gap-3 text-sm text-ink">
                <input type="checkbox" name="needsDecision" className="h-4 w-4 rounded border-slate-300" />
                Needs decision
              </label>
              <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white">
                Create task
              </button>
            </form>
          </Panel>

          <Panel>
            <SectionHeading title="Automation Jobs" description="Safe predefined jobs only. No arbitrary remote execution." />
            <div className="grid gap-3 p-5">
              <form action={runAutomationJobAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input type="hidden" name="action" value="github_sync" />
                <input type="hidden" name="redirectTo" value="/" />
                <input type="hidden" name="scopeLabel" value="All linked projects" />
                <button type="submit" className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-ink">
                  {automationActionLabels.github_sync}
                </button>
                <p className="mt-2 text-xs text-steel">Runs the existing GitHub sync and updates linked tasks from repo truth.</p>
              </form>

              {data.recentJobs.length === 0 ? (
                <EmptyState title="No jobs yet" description="Run a GitHub sync, runtime refresh, or prompt generation to populate this log." />
              ) : (
                data.recentJobs.map((job) => (
                  <div key={job.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{automationActionLabels[job.action]}</p>
                      <AutomationJobStatusBadge status={job.status} />
                    </div>
                    <p className="mt-2 text-sm text-steel">{job.message ?? job.scopeLabel ?? "Operator-triggered job."}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-steel">
                      {job.project ? <Link href={`/projects/${job.project.slug}`} className="text-signal hover:underline">{job.project.name}</Link> : null}
                      {job.task ? <Link href={`/tasks/${job.task.id}`} className="text-signal hover:underline">{job.task.title}</Link> : null}
                      <span>{new Date(job.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <SectionHeading title="Runtime Watch" description="Latest runtime truth linked back to deploy and runtime-check work." />
            <div className="grid gap-3 p-5">
              {data.runtimeProjects.length === 0 ? (
                <EmptyState title="No degraded runtime checks" description="Runtime snapshots will surface here once checks are recorded." />
              ) : (
                data.runtimeProjects.map((project) => (
                  <div key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/projects/${project.slug}`} className="font-medium text-ink hover:text-signal">
                        {project.name}
                      </Link>
                      <RuntimeStatusBadge status={project.runtime.overallStatus} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <RuntimeStatusBadge status={healthSignalLabel("api", project.runtime.apiHealthy, project.runtime.details)} />
                      <RuntimeStatusBadge status={healthSignalLabel("web", project.runtime.webHealthy, project.runtime.details)} />
                      <RuntimeStatusBadge status={healthSignalLabel("public", project.runtime.publicHealthy, project.runtime.details)} />
                    </div>
                    <p className="mt-3 text-sm text-ink">{project.runtime.reason ?? "No runtime issue captured."}</p>
                    <p className="mt-2 text-xs text-steel">
                      {project.runtime.checkedAt ? `Last runtime check ${project.runtime.checkedAt.toLocaleString()}` : "No runtime check timestamp"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <SectionHeading title="Recent Activity" description="Cross-project task, GitHub, runtime, and health events." />
          <ActivityFeed items={data.recentActivity} />
        </Panel>

        <Panel>
          <SectionHeading title="Open Decisions" description="Choices that still gate execution." />
          <div className="grid gap-3 p-5">
            {data.openDecisions.length === 0 ? (
              <EmptyState title="No open decisions" description="Resolved decisions will continue to live on the decisions page." />
            ) : (
              data.openDecisions.map((decision) => (
                <div key={decision.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-medium text-ink">{decision.title}</p>
                  <p className="mt-2 text-sm text-steel">{decision.description}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-steel">
                    {decision.project ? (
                      <Link href={`/projects/${decision.project.slug}`} className="text-signal hover:underline">
                        {decision.project.name}
                      </Link>
                    ) : null}
                    {decision.task ? <span>{decision.task.title}</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
