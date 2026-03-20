import Link from "next/link";
import { notFound } from "next/navigation";

import { runAutomationJobAction } from "@/lib/actions/automation";
import { getTaskDetailPageData } from "@/lib/data";

import { CopyButton } from "@/components/copy-button";
import {
  AgentBadge,
  AutomationJobStatusBadge,
  ExecutionModeBadge,
  ExecutionStatusBadge,
  PriorityBadge,
  RuntimeStatusBadge,
} from "@/components/status-badge";
import { TaskEventTimeline } from "@/components/task-event-timeline";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTaskDetailPageData(id);

  if (!data) {
    notFound();
  }

  const { task, runtime } = data;

  return (
    <div className="grid gap-6">
      <Panel>
        <SectionHeading
          title={task.title}
          description={task.description ?? "Operational task with persisted execution context and task events."}
          actions={
            <>
              <form action={runAutomationJobAction}>
                <input type="hidden" name="action" value="task_status_reconcile" />
                <input type="hidden" name="projectId" value={task.projectId} />
                <input type="hidden" name="projectSlug" value={task.project.slug} />
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="redirectTo" value={`/tasks/${task.id}`} />
                <input type="hidden" name="scopeLabel" value={task.title} />
                <button type="submit" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-ink">
                  Reconcile GitHub
                </button>
              </form>
              <LinkButton href={`/tasks/${task.id}/edit`}>Edit</LinkButton>
            </>
          }
        />
        <div className="grid gap-6 p-5 xl:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <ExecutionStatusBadge status={task.executionStatus} />
              <ExecutionModeBadge mode={task.executionMode} />
              <PriorityBadge priority={task.priority} />
              <AgentBadge agent={task.assignedAgent} />
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-ink">
              <p>Workflow stage: {task.status}</p>
              <p>Project: <Link href={`/projects/${task.project.slug}`} className="text-signal hover:underline">{task.project.name}</Link></p>
              <p>Linked project: {task.linkedProject?.name ?? task.project.name}</p>
              <p>Repo: {task.linkedGithubRepo ?? task.project.repoName}</p>
              <p>Issue: {task.linkedGithubIssueNumber ? `#${task.linkedGithubIssueNumber}` : "Not linked"}</p>
              <p>PR: {task.linkedGithubPrNumber ? `#${task.linkedGithubPrNumber}` : "Not linked"}</p>
              <p>Branch: {task.linkedGithubBranch ?? task.branchName ?? "Not linked"}</p>
              <p>Commit SHA: {task.linkedCommitSha ?? "Not linked"}</p>
              <p>Started: {task.startedAt ? task.startedAt.toLocaleString() : "Not started"}</p>
              <p>Completed: {task.completedAt ? task.completedAt.toLocaleString() : "Not completed"}</p>
              <p>Failed: {task.failedAt ? task.failedAt.toLocaleString() : "Not failed"}</p>
              <p>Last external update: {task.lastExternalUpdateAt ? task.lastExternalUpdateAt.toLocaleString() : "No external update yet"}</p>
            </div>

            {task.blockedReason ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{task.blockedReason}</div>
            ) : null}

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-ink">Verification and runtime context</p>
              <div className="flex flex-wrap gap-2">
                <RuntimeStatusBadge status={runtime.overallStatus} />
                {task.githubIssueUrl ? (
                  <a href={task.githubIssueUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-ink">
                    Open issue
                  </a>
                ) : null}
                {task.githubPrUrl ? (
                  <a href={task.githubPrUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-ink">
                    Open PR
                  </a>
                ) : null}
                {task.deployUrl ? (
                  <a href={task.deployUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-ink">
                    Open deploy
                  </a>
                ) : null}
              </div>
              <p className="text-sm text-steel">{runtime.reason ?? "No runtime issue is currently recorded for this project."}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <Panel>
              <SectionHeading title="Generate Prompt" description="Structured prompts for Codex, Cursor, or Claude with the current task context." />
              <div className="grid gap-3 p-5">
                {["codex", "cursor", "claude"].map((target) => (
                  <form key={target} action={runAutomationJobAction} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <input type="hidden" name="action" value="generate_agent_prompt" />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="projectSlug" value={task.project.slug} />
                    <input type="hidden" name="redirectTo" value={`/tasks/${task.id}`} />
                    <input type="hidden" name="promptTarget" value={target} />
                    <input type="hidden" name="scopeLabel" value={`${task.title} / ${target}`} />
                    <button type="submit" className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-ink">
                      Generate {target}
                    </button>
                  </form>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionHeading title="Job Log" description="Latest safe automation runs tied to this task." />
              <div className="grid gap-3 p-5">
                {task.automationJobs.length === 0 ? (
                  <EmptyState title="No task jobs yet" description="Prompt generation and reconciles will show up here." />
                ) : (
                  task.automationJobs.map((job) => (
                    <div key={job.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink">{job.action}</p>
                        <AutomationJobStatusBadge status={job.status} />
                      </div>
                      <p className="mt-2 text-sm text-steel">{job.message ?? "No job message recorded."}</p>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <SectionHeading title="Event Timeline" description="Every meaningful task change is persisted here." />
          <div className="p-5">
            {task.events.length === 0 ? (
              <EmptyState title="No events yet" description="Creating, reconciling, blocking, and completing the task will populate the timeline." />
            ) : (
              <TaskEventTimeline items={task.events} />
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="Saved Prompts" description="Latest generated prompts with one-click copy." />
          <div className="grid gap-3 p-5">
            {task.prompts.length === 0 ? (
              <EmptyState title="No prompts yet" description="Generate a Codex, Cursor, or Claude prompt from the controls above." />
            ) : (
              task.prompts.map((prompt) => (
                <div key={prompt.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{prompt.targetAgent}</p>
                    <CopyButton value={prompt.prompt} />
                  </div>
                  <p className="mt-2 text-xs text-steel">{prompt.contextSummary ?? "Task prompt"}</p>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-white p-3 text-xs text-ink">{prompt.prompt}</pre>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
