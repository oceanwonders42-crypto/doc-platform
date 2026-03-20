import type { Task } from "@prisma/client";

import {
  agentLabels,
  agentOptions,
  executionModeLabels,
  executionModeOptions,
  executionStatusLabels,
  executionStatusOptions,
  priorityLabels,
  priorityOptions,
  statusLabels,
  statusOptions,
} from "@/lib/constants";

import { Field, Input, Select, Textarea } from "@/components/ui/form-inputs";

type TaskFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  task?: (Task & { project?: { slug: string } | null }) | null;
  projects: Array<{ id: string; name: string; slug?: string }>;
  compact?: boolean;
  redirectTo?: string;
};

export function TaskForm({ action, task, projects, compact = false, redirectTo }: TaskFormProps) {
  return (
    <form action={action} className="grid gap-4 p-5">
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      {task?.project?.slug ? <input type="hidden" name="previousProjectSlug" value={task.project.slug} /> : null}
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

      <div className={compact ? "grid gap-4" : "grid gap-5 lg:grid-cols-2"}>
        <Field label="Task title" htmlFor="title">
          <Input id="title" name="title" defaultValue={task?.title ?? ""} required />
        </Field>
        <Field label="Project" htmlFor="projectId">
          <Select id="projectId" name="projectId" defaultValue={task?.projectId ?? projects[0]?.id} required>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={task?.description ?? ""} />
      </Field>

      <div className="grid gap-5 lg:grid-cols-4">
        <Field label="Workflow stage" htmlFor="status">
          <Select id="status" name="status" defaultValue={task?.status ?? "ready"}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Execution mode" htmlFor="executionMode">
          <Select id="executionMode" name="executionMode" defaultValue={task?.executionMode ?? "manual"}>
            {executionModeOptions.map((mode) => (
              <option key={mode} value={mode}>
                {executionModeLabels[mode]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Execution status" htmlFor="executionStatus">
          <Select id="executionStatus" name="executionStatus" defaultValue={task?.executionStatus ?? "queued"}>
            {executionStatusOptions.map((status) => (
              <option key={status} value={status}>
                {executionStatusLabels[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={task?.priority ?? "medium"}>
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Field label="Assigned agent" htmlFor="assignedAgent">
          <Select id="assignedAgent" name="assignedAgent" defaultValue={task?.assignedAgent ?? "codex"}>
            {agentOptions.map((agent) => (
              <option key={agent} value={agent}>
                {agentLabels[agent]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Linked project" htmlFor="linkedProjectId">
          <Select id="linkedProjectId" name="linkedProjectId" defaultValue={task?.linkedProjectId ?? task?.projectId ?? projects[0]?.id}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="mt-8 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            name="needsDecision"
            defaultChecked={task?.needsDecision ?? false}
            className="h-4 w-4 rounded border-slate-300"
          />
          Needs decision
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Next step" htmlFor="nextStep">
          <Input id="nextStep" name="nextStep" defaultValue={task?.nextStep ?? ""} />
        </Field>
        <Field label="Deploy URL" htmlFor="deployUrl">
          <Input id="deployUrl" name="deployUrl" type="url" defaultValue={task?.deployUrl ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Field label="GitHub repo" htmlFor="linkedGithubRepo">
          <Input id="linkedGithubRepo" name="linkedGithubRepo" defaultValue={task?.linkedGithubRepo ?? ""} placeholder="owner/repo" />
        </Field>
        <Field label="Issue number" htmlFor="linkedGithubIssueNumber">
          <Input id="linkedGithubIssueNumber" name="linkedGithubIssueNumber" type="number" defaultValue={task?.linkedGithubIssueNumber ?? ""} />
        </Field>
        <Field label="PR number" htmlFor="linkedGithubPrNumber">
          <Input id="linkedGithubPrNumber" name="linkedGithubPrNumber" type="number" defaultValue={task?.linkedGithubPrNumber ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="GitHub issue URL" htmlFor="githubIssueUrl">
          <Input id="githubIssueUrl" name="githubIssueUrl" type="url" defaultValue={task?.githubIssueUrl ?? ""} />
        </Field>
        <Field label="GitHub PR URL" htmlFor="githubPrUrl">
          <Input id="githubPrUrl" name="githubPrUrl" type="url" defaultValue={task?.githubPrUrl ?? ""} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Field label="Legacy branch name" htmlFor="branchName">
          <Input id="branchName" name="branchName" defaultValue={task?.branchName ?? ""} />
        </Field>
        <Field label="Linked branch" htmlFor="linkedGithubBranch">
          <Input id="linkedGithubBranch" name="linkedGithubBranch" defaultValue={task?.linkedGithubBranch ?? ""} />
        </Field>
        <Field label="Commit SHA" htmlFor="linkedCommitSha">
          <Input id="linkedCommitSha" name="linkedCommitSha" defaultValue={task?.linkedCommitSha ?? ""} />
        </Field>
      </div>

      <Field label="Blocked reason" htmlFor="blockedReason">
        <Textarea id="blockedReason" name="blockedReason" defaultValue={task?.blockedReason ?? ""} />
      </Field>

      <div className="flex justify-end">
        <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white" type="submit">
          {task ? "Save task" : "Create task"}
        </button>
      </div>
    </form>
  );
}
