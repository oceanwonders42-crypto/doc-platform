import Link from "next/link";

import {
  createTaskAction,
  markTaskDoneAction,
  toggleTaskBlockedAction,
  updateTaskAssignmentAction,
  updateTaskStatusAction,
} from "@/lib/actions/tasks";
import {
  agentLabels,
  agentOptions,
  executionModeLabels,
  executionModeOptions,
  executionStatusLabels,
  executionStatusOptions,
  priorityLabels,
  priorityOptions,
} from "@/lib/constants";
import { getTaskBoard } from "@/lib/data";

import { TaskForm } from "@/components/forms/task-form";
import {
  AgentBadge,
  ExecutionModeBadge,
  ExecutionStatusBadge,
  PriorityBadge,
} from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/form-inputs";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = {
    q: readParam(params.q),
    projectId: readParam(params.projectId),
    executionStatus: readParam(params.executionStatus) as never,
    executionMode: readParam(params.executionMode) as never,
    priority: readParam(params.priority) as never,
    agent: readParam(params.agent) as never,
  };
  const data = await getTaskBoard(filters);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.9fr_1fr]">
      <Panel>
        <SectionHeading title="Task Execution Board" description="Run work through queued, active, blocked, review, and done states with durable task events." />
        <div className="grid gap-4 p-5">
          <form className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:grid-cols-6">
            <Field label="Search" htmlFor="q">
              <Input id="q" name="q" defaultValue={filters.q ?? ""} placeholder="Search title, repo, project" />
            </Field>
            <Field label="Project" htmlFor="projectId">
              <Select id="projectId" name="projectId" defaultValue={filters.projectId ?? ""}>
                <option value="">All projects</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Execution status" htmlFor="executionStatus">
              <Select id="executionStatus" name="executionStatus" defaultValue={filters.executionStatus ?? ""}>
                <option value="">All states</option>
                {executionStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {executionStatusLabels[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Execution mode" htmlFor="executionMode">
              <Select id="executionMode" name="executionMode" defaultValue={filters.executionMode ?? ""}>
                <option value="">All modes</option>
                {executionModeOptions.map((option) => (
                  <option key={option} value={option}>
                    {executionModeLabels[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue={filters.priority ?? ""}>
                <option value="">All priorities</option>
                {priorityOptions.map((option) => (
                  <option key={option} value={option}>
                    {priorityLabels[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Agent" htmlFor="agent">
              <Select id="agent" name="agent" defaultValue={filters.agent ?? ""}>
                <option value="">All agents</option>
                {agentOptions.map((option) => (
                  <option key={option} value={option}>
                    {agentLabels[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-3 xl:col-span-6">
              <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white">
                Apply filters
              </button>
              <Link href="/tasks" className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink">
                Reset
              </Link>
            </div>
          </form>

          {data.tasks.length === 0 ? (
            <EmptyState title="No matching tasks" description="Try widening the filters or create a fresh task." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
              {executionStatusOptions.map((executionStatus) => {
                const tasks = data.tasks.filter((task) => task.executionStatus === executionStatus);

                return (
                  <div key={executionStatus} className="rounded-3xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ExecutionStatusBadge status={executionStatus} />
                        <span className="text-sm font-medium text-ink">{executionStatusLabels[executionStatus]}</span>
                      </div>
                      <span className="text-xs text-steel">{tasks.length}</span>
                    </div>
                    <div className="grid gap-3 p-4">
                      {tasks.length === 0 ? (
                        <EmptyState title="Empty lane" description="No tasks currently sit in this execution state." />
                      ) : (
                        tasks.map((task) => (
                          <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <ExecutionModeBadge mode={task.executionMode} />
                              <PriorityBadge priority={task.priority} />
                              <AgentBadge agent={task.assignedAgent} />
                            </div>
                            <p className="mt-3 font-medium text-ink">{task.title}</p>
                            <p className="mt-1 text-sm text-steel">{task.project.name}</p>
                            {task.description ? <p className="mt-3 text-sm text-steel">{task.description}</p> : null}
                            {task.nextStep ? <p className="mt-3 text-sm text-ink">Next: {task.nextStep}</p> : null}
                            {task.blockedReason ? (
                              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{task.blockedReason}</p>
                            ) : null}
                            <div className="mt-4 grid gap-3">
                              <form action={updateTaskStatusAction} className="grid gap-2">
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="projectSlug" value={task.project.slug} />
                                <Select name="executionStatus" defaultValue={task.executionStatus}>
                                  {executionStatusOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {executionStatusLabels[option]}
                                    </option>
                                  ))}
                                </Select>
                                {task.executionStatus === "blocked" ? (
                                  <Textarea name="blockedReason" defaultValue={task.blockedReason ?? ""} className="min-h-20" />
                                ) : null}
                                <button type="submit" className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-ink">
                                  Update state
                                </button>
                              </form>

                              <form action={updateTaskAssignmentAction} className="grid gap-2">
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="projectSlug" value={task.project.slug} />
                                <Select name="assignedAgent" defaultValue={task.assignedAgent}>
                                  {agentOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {agentLabels[option]}
                                    </option>
                                  ))}
                                </Select>
                                <button type="submit" className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-ink">
                                  Reassign
                                </button>
                              </form>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <form action={toggleTaskBlockedAction} className="grid gap-2">
                                  <input type="hidden" name="id" value={task.id} />
                                  <input type="hidden" name="projectSlug" value={task.project.slug} />
                                  <input type="hidden" name="blocked" value={task.executionStatus !== "blocked" ? "true" : "false"} />
                                  {task.executionStatus !== "blocked" ? (
                                    <Textarea name="blockedReason" placeholder="Why is this blocked?" className="min-h-20" />
                                  ) : null}
                                  <button type="submit" className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
                                    {task.executionStatus === "blocked" ? "Unblock" : "Mark blocked"}
                                  </button>
                                </form>
                                <form action={markTaskDoneAction}>
                                  <input type="hidden" name="id" value={task.id} />
                                  <input type="hidden" name="projectSlug" value={task.project.slug} />
                                  <button type="submit" className="w-full rounded-xl bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900">
                                    Mark done
                                  </button>
                                </form>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-3 text-xs text-steel">
                              {task.linkedGithubRepo ? <span>Repo: {task.linkedGithubRepo}</span> : null}
                              {task.linkedGithubBranch ? <span>Branch: {task.linkedGithubBranch}</span> : task.branchName ? <span>Branch: {task.branchName}</span> : null}
                              {task.lastExternalUpdateAt ? <span>External: {new Date(task.lastExternalUpdateAt).toLocaleString()}</span> : null}
                            </div>
                            {task.events[0] ? <p className="mt-3 text-xs text-steel">{task.events[0].message}</p> : null}
                            <div className="mt-4 flex flex-wrap gap-3 text-xs text-steel">
                              <Link href={`/tasks/${task.id}`} className="text-signal hover:underline">
                                Task detail
                              </Link>
                              <Link href={`/tasks/${task.id}/edit`} className="text-signal hover:underline">
                                Full edit
                              </Link>
                              {task.githubIssueUrl ? (
                                <a href={task.githubIssueUrl} target="_blank" rel="noreferrer" className="text-signal hover:underline">
                                  Issue
                                </a>
                              ) : null}
                              {task.githubPrUrl ? (
                                <a href={task.githubPrUrl} target="_blank" rel="noreferrer" className="text-signal hover:underline">
                                  PR
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Create Task" description="Add a new real task with linked execution context and agent ownership." />
        <TaskForm action={createTaskAction} projects={data.projects} compact redirectTo="/tasks" />
      </Panel>
    </div>
  );
}
