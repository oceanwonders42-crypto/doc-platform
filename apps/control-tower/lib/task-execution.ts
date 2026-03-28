import { type Prisma, type Task, type TaskExecutionStatus, type TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

type EventSource = "manual" | "github" | "runtime" | "automation" | "system";

type TaskEventInput = {
  taskId: string;
  projectId?: string | null;
  type: string;
  title: string;
  message: string;
  source: EventSource;
  fromExecutionStatus?: TaskExecutionStatus | null;
  toExecutionStatus?: TaskExecutionStatus | null;
  metadata?: Prisma.InputJsonValue;
};

type TaskLike = Pick<
  Task,
  | "id"
  | "projectId"
  | "title"
  | "status"
  | "executionMode"
  | "executionStatus"
  | "assignedAgent"
  | "githubIssueUrl"
  | "githubPrUrl"
  | "deployUrl"
  | "linkedGithubRepo"
  | "linkedGithubIssueNumber"
  | "linkedGithubPrNumber"
  | "linkedGithubBranch"
  | "linkedCommitSha"
  | "blockedReason"
>;

export function extractGitHubNumber(url: string | null | undefined, kind: "issues" | "pull") {
  if (!url) {
    return null;
  }

  const pattern = kind === "issues" ? /\/issues\/(\d+)(?:\/|$)/ : /\/pull\/(\d+)(?:\/|$)/;
  const match = url.match(pattern);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

export function deriveWorkflowStatus(executionStatus: TaskExecutionStatus): TaskStatus {
  switch (executionStatus) {
    case "queued":
      return "ready";
    case "in_progress":
      return "in_progress";
    case "blocked":
    case "failed":
      return "blocked";
    case "review":
      return "review";
    case "done":
      return "done";
    case "waiting_external":
      return "ready";
  }
}

export function deriveExecutionStatus(status: TaskStatus): TaskExecutionStatus {
  switch (status) {
    case "inbox":
    case "ready":
      return "queued";
    case "in_progress":
      return "in_progress";
    case "review":
      return "review";
    case "blocked":
      return "blocked";
    case "done":
      return "done";
  }
}

export function buildTaskExecutionMetadata(input: {
  projectId: string;
  linkedProjectId?: string | null;
  status?: TaskStatus;
  executionStatus?: TaskExecutionStatus;
  githubIssueUrl?: string | null;
  githubPrUrl?: string | null;
  branchName?: string | null;
  linkedGithubRepo?: string | null;
  linkedGithubIssueNumber?: number | null;
  linkedGithubPrNumber?: number | null;
  linkedGithubBranch?: string | null;
}) {
  const executionStatus = input.executionStatus ?? (input.status ? deriveExecutionStatus(input.status) : "queued");
  const linkedGithubIssueNumber = input.linkedGithubIssueNumber ?? extractGitHubNumber(input.githubIssueUrl, "issues");
  const linkedGithubPrNumber = input.linkedGithubPrNumber ?? extractGitHubNumber(input.githubPrUrl, "pull");

  return {
    linkedProjectId: input.linkedProjectId ?? input.projectId,
    executionStatus,
    status: input.status ?? deriveWorkflowStatus(executionStatus),
    linkedGithubIssueNumber,
    linkedGithubPrNumber,
    linkedGithubBranch: input.linkedGithubBranch ?? input.branchName ?? null,
    linkedGithubRepo: input.linkedGithubRepo ?? null,
  };
}

export function buildExecutionTimestamps(previous: Pick<Task, "executionStatus" | "startedAt" | "completedAt" | "failedAt"> | null, nextExecutionStatus: TaskExecutionStatus) {
  const now = new Date();
  const startedAt =
    nextExecutionStatus === "in_progress" && !previous?.startedAt ? now : previous?.startedAt ?? undefined;
  const completedAt = nextExecutionStatus === "done" ? now : nextExecutionStatus === "failed" ? null : undefined;
  const failedAt = nextExecutionStatus === "failed" ? now : nextExecutionStatus === "done" ? null : undefined;

  return {
    startedAt,
    completedAt,
    failedAt,
  };
}

export async function recordTaskEvent(db: DbClient, input: TaskEventInput) {
  const event = await db.taskEvent.create({
    data: {
      taskId: input.taskId,
      projectId: input.projectId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      source: input.source,
      fromExecutionStatus: input.fromExecutionStatus ?? undefined,
      toExecutionStatus: input.toExecutionStatus ?? undefined,
      metadata: input.metadata,
    },
  });

  await db.activityLog.create({
    data: {
      projectId: input.projectId ?? null,
      taskId: input.taskId,
      type: input.type,
      message: input.message,
      metadata: input.metadata,
    },
  });

  return event;
}

function buildExecutionStatusEvent(before: TaskExecutionStatus | null | undefined, after: TaskExecutionStatus, title: string) {
  const mapping: Record<TaskExecutionStatus, { type: string; title: string }> = {
    queued: { type: "task.queued", title: title || "Queued" },
    in_progress: { type: "task.in_progress", title: title || "In Progress" },
    blocked: { type: "task.blocked", title: title || "Blocked" },
    review: { type: "task.review", title: title || "In Review" },
    done: { type: "task.done", title: title || "Done" },
    failed: { type: "task.failed", title: title || "Failed" },
    waiting_external: { type: "task.waiting_external", title: title || "Waiting External" },
  };

  return {
    ...mapping[after],
    fromExecutionStatus: before ?? null,
    toExecutionStatus: after,
  };
}

export function buildTaskEventsFromChanges(before: TaskLike | null, after: TaskLike, source: EventSource): TaskEventInput[] {
  const events: TaskEventInput[] = [];

  if (!before) {
    events.push({
      taskId: after.id,
      projectId: after.projectId,
      type: "task.created",
      title: "Task Created",
      message: `Created task ${after.title}.`,
      source,
      toExecutionStatus: after.executionStatus,
      metadata: {
        executionMode: after.executionMode,
        executionStatus: after.executionStatus,
        assignedAgent: after.assignedAgent,
      },
    });
  }

  if (!before || before.assignedAgent !== after.assignedAgent) {
    events.push({
      taskId: after.id,
      projectId: after.projectId,
      type: "task.assigned",
      title: "Assigned",
      message: `Assigned ${after.title} to ${after.assignedAgent}.`,
      source,
      metadata: {
        before: before?.assignedAgent ?? null,
        after: after.assignedAgent,
      },
    });
  }

  if (
    !before ||
    before.linkedGithubIssueNumber !== after.linkedGithubIssueNumber ||
    before.linkedGithubPrNumber !== after.linkedGithubPrNumber ||
    before.linkedGithubRepo !== after.linkedGithubRepo
  ) {
    const messageParts = [
      after.linkedGithubRepo ? `${after.linkedGithubRepo}` : null,
      after.linkedGithubIssueNumber ? `issue #${after.linkedGithubIssueNumber}` : null,
      after.linkedGithubPrNumber ? `PR #${after.linkedGithubPrNumber}` : null,
    ].filter((value): value is string => Boolean(value));

    if (messageParts.length > 0) {
      events.push({
        taskId: after.id,
        projectId: after.projectId,
        type: "task.github_linked",
        title: "GitHub Linked",
        message: `Linked ${after.title} to ${messageParts.join(" / ")}.`,
        source,
        metadata: {
          repo: after.linkedGithubRepo,
          issueNumber: after.linkedGithubIssueNumber,
          prNumber: after.linkedGithubPrNumber,
        },
      });
    }
  }

  if (
    !before ||
    before.linkedGithubBranch !== after.linkedGithubBranch ||
    before.linkedCommitSha !== after.linkedCommitSha
  ) {
    if (after.linkedGithubBranch || after.linkedCommitSha) {
      events.push({
        taskId: after.id,
        projectId: after.projectId,
        type: "task.github_context_updated",
        title: "GitHub Context Updated",
        message: `Updated GitHub context for ${after.title}.`,
        source,
        metadata: {
          branch: after.linkedGithubBranch,
          commitSha: after.linkedCommitSha,
        },
      });
    }
  }

  if (!before || before.executionStatus !== after.executionStatus) {
    const executionEvent = buildExecutionStatusEvent(before?.executionStatus, after.executionStatus, "");
    events.push({
      taskId: after.id,
      projectId: after.projectId,
      type: executionEvent.type,
      title: executionEvent.title,
      message: `${after.title} moved to ${after.executionStatus.replace("_", " ")}.`,
      source,
      fromExecutionStatus: executionEvent.fromExecutionStatus,
      toExecutionStatus: executionEvent.toExecutionStatus,
      metadata: {
        blockedReason: after.blockedReason,
      },
    });
  } else if (
    after.executionStatus === "blocked" &&
    before?.blockedReason !== after.blockedReason &&
    after.blockedReason
  ) {
    events.push({
      taskId: after.id,
      projectId: after.projectId,
      type: "task.blocked_reason_updated",
      title: "Blocked Reason Updated",
      message: `Updated blocked reason for ${after.title}.`,
      source,
      toExecutionStatus: after.executionStatus,
      metadata: {
        blockedReason: after.blockedReason,
      },
    });
  }

  return events;
}

export async function recordTaskEventsFromChanges(
  db: DbClient,
  before: TaskLike | null,
  after: TaskLike,
  source: EventSource,
) {
  const events = buildTaskEventsFromChanges(before, after, source);

  for (const event of events) {
    await recordTaskEvent(db, event);
  }

  return events;
}
