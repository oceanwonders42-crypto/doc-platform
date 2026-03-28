import type {
  Prisma,
  Project,
  Task,
  TaskExecutionStatus,
  TaskPromptTarget,
} from "@prisma/client";

import { getRuntimeSnapshot } from "@/lib/runtime-checks";
import { getGitHubProvider, type GitHubIssue, type GitHubPullRequest } from "@/lib/integrations/github";
import { prisma } from "@/lib/prisma";
import {
  buildExecutionTimestamps,
  buildTaskExecutionMetadata,
  deriveWorkflowStatus,
  recordTaskEvent,
  recordTaskEventsFromChanges,
} from "@/lib/task-execution";

type TaskWithProject = Prisma.TaskGetPayload<{
  include: {
    project: true;
    linkedProject: true;
  };
}>;

function getRepoIdentifier(task: Pick<Task, "linkedGithubRepo">, project: Pick<Project, "repoName" | "repoUrl">) {
  return task.linkedGithubRepo ?? project.repoName ?? project.repoUrl;
}

function getLatestExternalUpdate(issue: GitHubIssue | null, pullRequest: GitHubPullRequest | null) {
  const timestamps = [issue?.updatedAt, pullRequest?.updatedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime());

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

function computeGitHubPatch(task: TaskWithProject, issue: GitHubIssue | null, pullRequest: GitHubPullRequest | null) {
  const update: Prisma.TaskUncheckedUpdateInput = {};
  const repoIdentifier = getRepoIdentifier(task, task.project);

  if (repoIdentifier) {
    update.linkedGithubRepo = repoIdentifier;
  }

  if (pullRequest) {
    update.linkedGithubPrNumber = pullRequest.number;
    update.linkedGithubBranch = pullRequest.headRefName;
    update.linkedCommitSha = pullRequest.headSha;
    update.githubPrUrl = pullRequest.url;
  }

  if (issue) {
    update.linkedGithubIssueNumber = issue.number;
    update.githubIssueUrl = issue.url;
  }

  const lastExternalUpdateAt = getLatestExternalUpdate(issue, pullRequest);
  if (lastExternalUpdateAt) {
    update.lastExternalUpdateAt = lastExternalUpdateAt;
  }

  let nextExecutionStatus: TaskExecutionStatus | null = null;
  let blockedReason: string | null | undefined = undefined;
  let event: {
    type: string;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  } | null = null;

  if (pullRequest) {
    if (pullRequest.mergedAt) {
      nextExecutionStatus = task.executionMode === "deploy" ? "waiting_external" : "done";
      blockedReason = null;
      event = {
        type: "task.github_pr_merged",
        title: "PR Merged",
        message: `GitHub PR #${pullRequest.number} merged for ${task.title}.`,
        metadata: {
          prNumber: pullRequest.number,
          mergedAt: pullRequest.mergedAt,
        },
      };
    } else if (pullRequest.state === "closed") {
      nextExecutionStatus = "failed";
      blockedReason = "Linked PR was closed without merge.";
      event = {
        type: "task.github_pr_closed",
        title: "PR Closed",
        message: `GitHub PR #${pullRequest.number} closed without merge for ${task.title}.`,
        metadata: {
          prNumber: pullRequest.number,
        },
      };
    } else if (pullRequest.checkStatus === "failure") {
      nextExecutionStatus = "blocked";
      blockedReason = `GitHub checks are failing for PR #${pullRequest.number}.`;
      event = {
        type: "task.github_checks_failed",
        title: "Checks Failing",
        message: `GitHub checks are failing for PR #${pullRequest.number}.`,
        metadata: {
          prNumber: pullRequest.number,
          checkStatus: pullRequest.checkStatus,
        },
      };
    } else if (pullRequest.draft) {
      nextExecutionStatus = "in_progress";
      blockedReason = null;
      event = {
        type: "task.github_pr_draft",
        title: "Draft PR",
        message: `Draft PR #${pullRequest.number} is in progress for ${task.title}.`,
        metadata: {
          prNumber: pullRequest.number,
        },
      };
    } else {
      nextExecutionStatus = "review";
      blockedReason = null;
      event = {
        type: "task.github_pr_open",
        title: "PR Open",
        message: `PR #${pullRequest.number} is ready for review on ${task.title}.`,
        metadata: {
          prNumber: pullRequest.number,
          checkStatus: pullRequest.checkStatus,
        },
      };
    }
  } else if (issue) {
    if (issue.state === "closed") {
      nextExecutionStatus = task.executionStatus === "review" ? "review" : "done";
      blockedReason = null;
      event = {
        type: "task.github_issue_closed",
        title: "Issue Closed",
        message: `GitHub issue #${issue.number} closed for ${task.title}.`,
        metadata: {
          issueNumber: issue.number,
          closedAt: issue.closedAt,
        },
      };
    } else {
      nextExecutionStatus =
        task.executionStatus === "in_progress" || task.startedAt ? "in_progress" : "queued";
      blockedReason = task.executionStatus === "blocked" ? task.blockedReason : null;
      event = {
        type: "task.github_issue_open",
        title: "Issue Open",
        message: `GitHub issue #${issue.number} remains open for ${task.title}.`,
        metadata: {
          issueNumber: issue.number,
        },
      };
    }
  }

  if (nextExecutionStatus) {
    update.executionStatus = nextExecutionStatus;
    update.status = deriveWorkflowStatus(nextExecutionStatus);
    update.blockedReason = blockedReason;
    Object.assign(update, buildExecutionTimestamps(task, nextExecutionStatus));
  }

  return { update, event };
}

async function getGitHubState(task: TaskWithProject) {
  const repoIdentifier = getRepoIdentifier(task, task.project);

  if (!repoIdentifier) {
    return {
      issue: null,
      pullRequest: null,
    };
  }

  const provider = getGitHubProvider();
  const [issue, pullRequest] = await Promise.all([
    task.linkedGithubIssueNumber ? provider.getIssue(repoIdentifier, task.linkedGithubIssueNumber) : Promise.resolve(null),
    task.linkedGithubPrNumber ? provider.getPullRequest(repoIdentifier, task.linkedGithubPrNumber) : Promise.resolve(null),
  ]);

  return { issue, pullRequest };
}

export async function reconcileGitHubLinkedTasks(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      OR: [
        { linkedGithubIssueNumber: { not: null } },
        { linkedGithubPrNumber: { not: null } },
        { githubIssueUrl: { not: null } },
        { githubPrUrl: { not: null } },
      ],
    },
    include: {
      project: true,
      linkedProject: true,
    },
  });

  let updated = 0;

  for (const task of tasks) {
    const normalized = buildTaskExecutionMetadata(task);
    const taskWithLinks = { ...task, ...normalized };
    const { issue, pullRequest } = await getGitHubState(taskWithLinks);
    const { update, event } = computeGitHubPatch(taskWithLinks, issue, pullRequest);

    if (Object.keys(update).length === 0) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const after = await tx.task.update({
        where: { id: task.id },
        data: update,
      });

      await recordTaskEventsFromChanges(tx, taskWithLinks, after, "github");

      if (event) {
        await recordTaskEvent(tx, {
          taskId: after.id,
          projectId: after.projectId,
          type: event.type,
          title: event.title,
          message: event.message,
          source: "github",
          toExecutionStatus: after.executionStatus,
          metadata: event.metadata,
        });
      }
    });

    updated += 1;
  }

  return {
    ok: true,
    updated,
  };
}

export async function reconcileRuntimeLinkedTasks(input: {
  projectId: string;
  overallStatus: string;
  checkedAt: Date;
  reason: string | null;
}) {
  const tasks = await prisma.task.findMany({
    where: {
      OR: [{ projectId: input.projectId }, { linkedProjectId: input.projectId }],
      executionMode: { in: ["deploy", "runtime_check"] },
    },
    include: {
      project: true,
      linkedProject: true,
    },
  });

  let updated = 0;

  for (const task of tasks) {
    let nextExecutionStatus: TaskExecutionStatus;
    let eventType: string;
    let eventTitle: string;

    if (input.overallStatus === "healthy") {
      nextExecutionStatus = "done";
      eventType = task.executionMode === "deploy" ? "task.deploy_healthy" : "task.runtime_healthy";
      eventTitle = task.executionMode === "deploy" ? "Deploy Healthy" : "Runtime Healthy";
    } else if (input.overallStatus === "failed" || input.overallStatus === "unhealthy") {
      nextExecutionStatus = task.executionMode === "deploy" ? "failed" : "failed";
      eventType = task.executionMode === "deploy" ? "task.deploy_unhealthy" : "task.runtime_unhealthy";
      eventTitle = task.executionMode === "deploy" ? "Deploy Failed" : "Runtime Failed";
    } else {
      nextExecutionStatus = "blocked";
      eventType = task.executionMode === "deploy" ? "task.deploy_unhealthy" : "task.runtime_unhealthy";
      eventTitle = task.executionMode === "deploy" ? "Deploy Blocked" : "Runtime Blocked";
    }

    const update: Prisma.TaskUncheckedUpdateInput = {
      executionStatus: nextExecutionStatus,
      status: deriveWorkflowStatus(nextExecutionStatus),
      blockedReason: nextExecutionStatus === "done" ? null : input.reason ?? "Runtime is not healthy yet.",
      lastExternalUpdateAt: input.checkedAt,
      ...buildExecutionTimestamps(task, nextExecutionStatus),
    };

    await prisma.$transaction(async (tx) => {
      const after = await tx.task.update({
        where: { id: task.id },
        data: update,
      });

      await recordTaskEventsFromChanges(tx, task, after, "runtime");
      await recordTaskEvent(tx, {
        taskId: after.id,
        projectId: after.projectId,
        type: eventType,
        title: eventTitle,
        message: `${eventTitle} for ${after.title}.`,
        source: "runtime",
        toExecutionStatus: after.executionStatus,
        metadata: {
          runtimeStatus: input.overallStatus,
          checkedAt: input.checkedAt.toISOString(),
          reason: input.reason,
        },
      });
    });

    updated += 1;
  }

  return {
    ok: true,
    updated,
  };
}

export async function generateTaskPrompt(taskId: string, targetAgent: TaskPromptTarget) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      linkedProject: true,
    },
  });

  if (!task) {
    return {
      ok: false,
      message: "Task not found.",
    };
  }

  const runtime = getRuntimeSnapshot(task.project);
  const projectContext = [
    `Project: ${task.project.name}`,
    `Repo: ${task.project.repoName}`,
    `Default branch: ${task.project.defaultBranch}`,
    `Deploy target: ${task.project.deployTargetName}`,
    task.project.description ? `Description: ${task.project.description}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const githubContext = [
    task.linkedGithubRepo ? `Repo link: ${task.linkedGithubRepo}` : `Repo link: ${task.project.repoName}`,
    task.linkedGithubIssueNumber ? `Issue: #${task.linkedGithubIssueNumber}` : "Issue: not linked",
    task.linkedGithubPrNumber ? `PR: #${task.linkedGithubPrNumber}` : "PR: not linked",
    task.linkedGithubBranch ? `Branch: ${task.linkedGithubBranch}` : task.branchName ? `Branch: ${task.branchName}` : "Branch: not linked",
    task.linkedCommitSha ? `Commit SHA: ${task.linkedCommitSha}` : "Commit SHA: not linked",
    task.lastExternalUpdateAt ? `Last external update: ${task.lastExternalUpdateAt.toISOString()}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const runtimeContext = [
    `Runtime status: ${runtime.overallStatus}`,
    runtime.reason ? `Runtime reason: ${runtime.reason}` : null,
    runtime.checkedAt ? `Last runtime check: ${runtime.checkedAt.toISOString()}` : "Last runtime check: not recorded",
    task.deployUrl ? `Deploy URL: ${task.deployUrl}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const expectedOutput = [
    "Expected output format:",
    "1. Short status summary",
    "2. Concrete implementation plan",
    "3. Files changed or commands run",
    "4. Verification results",
    "5. Risks or blockers",
  ].join("\n");

  const verificationRequirements = [
    "Verification requirements:",
    "- Confirm the task goal is completed or explain what remains manual.",
    "- Run or describe the structural checks needed for touched code paths.",
    "- Call out GitHub/runtime/deploy assumptions explicitly.",
  ].join("\n");

  const prompt = [
    `You are ${targetAgent} working inside the Onyx control tower context.`,
    "",
    `Task title: ${task.title}`,
    task.description ? `Task description: ${task.description}` : null,
    `Execution mode: ${task.executionMode}`,
    `Execution status: ${task.executionStatus}`,
    task.nextStep ? `Next step: ${task.nextStep}` : null,
    task.blockedReason ? `Blocked reason: ${task.blockedReason}` : null,
    "",
    "Project context:",
    projectContext,
    "",
    "Linked GitHub context:",
    githubContext,
    "",
    "Linked runtime/deploy context:",
    runtimeContext,
    "",
    expectedOutput,
    "",
    verificationRequirements,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const promptRecord = await prisma.taskPrompt.create({
    data: {
      taskId: task.id,
      targetAgent,
      prompt,
      contextSummary: `${task.project.name} / ${task.executionMode} / ${task.executionStatus}`,
    },
  });

  await recordTaskEvent(prisma, {
    taskId: task.id,
    projectId: task.projectId,
    type: "task.prompt_generated",
    title: "Prompt Generated",
    message: `Generated a ${targetAgent} prompt for ${task.title}.`,
    source: "automation",
    toExecutionStatus: task.executionStatus,
    metadata: {
      promptId: promptRecord.id,
      targetAgent,
    },
  });

  return {
    ok: true,
    promptId: promptRecord.id,
    prompt,
  };
}

export async function reconcileProjectHealth(projectId: string) {
  const [project, tasks] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
    }),
    prisma.task.findMany({
      where: {
        OR: [{ projectId }, { linkedProjectId: projectId }],
      },
      select: {
        id: true,
        title: true,
        executionStatus: true,
        executionMode: true,
      },
    }),
  ]);

  if (!project) {
    return {
      ok: false,
      message: "Project not found.",
    };
  }

  const summary = {
    queued: tasks.filter((task) => task.executionStatus === "queued").length,
    running: tasks.filter((task) => task.executionStatus === "in_progress").length,
    blocked: tasks.filter((task) => task.executionStatus === "blocked" || task.executionStatus === "failed").length,
    review: tasks.filter((task) => task.executionStatus === "review").length,
    done: tasks.filter((task) => task.executionStatus === "done").length,
    runtimeStatus: project.runtimeStatus,
  };

  await prisma.activityLog.create({
    data: {
      projectId,
      type: "project.health.reconciled",
      message: `Reconciled project health for ${project.name}.`,
      metadata: summary as Prisma.InputJsonValue,
    },
  });

  return {
    ok: true,
    summary,
  };
}
