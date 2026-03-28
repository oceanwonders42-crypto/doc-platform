"use server";

import type { Prisma, TaskExecutionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  buildExecutionTimestamps,
  buildTaskExecutionMetadata,
  recordTaskEventsFromChanges,
} from "@/lib/task-execution";
import { toNullableString } from "@/lib/utils";
import { taskSchema } from "@/lib/validations";

function normalizeTask(formData: FormData) {
  return taskSchema.parse({
    id: toNullableString(formData.get("id")) ?? undefined,
    projectId: String(formData.get("projectId") ?? ""),
    linkedProjectId: toNullableString(formData.get("linkedProjectId")),
    title: String(formData.get("title") ?? "").trim(),
    description: toNullableString(formData.get("description")),
    status: formData.get("status"),
    executionMode: formData.get("executionMode"),
    executionStatus: formData.get("executionStatus"),
    priority: formData.get("priority"),
    assignedAgent: formData.get("assignedAgent"),
    githubIssueUrl: toNullableString(formData.get("githubIssueUrl")),
    githubPrUrl: toNullableString(formData.get("githubPrUrl")),
    deployUrl: toNullableString(formData.get("deployUrl")),
    branchName: toNullableString(formData.get("branchName")),
    linkedGithubRepo: toNullableString(formData.get("linkedGithubRepo")),
    linkedGithubIssueNumber: toNullableString(formData.get("linkedGithubIssueNumber")),
    linkedGithubPrNumber: toNullableString(formData.get("linkedGithubPrNumber")),
    linkedGithubBranch: toNullableString(formData.get("linkedGithubBranch")),
    linkedCommitSha: toNullableString(formData.get("linkedCommitSha")),
    blockedReason: toNullableString(formData.get("blockedReason")),
    needsDecision: formData.get("needsDecision") === "on",
    nextStep: toNullableString(formData.get("nextStep")),
  });
}

async function getProject(taskIdOrProjectId: { taskId?: string; projectId?: string }) {
  if (taskIdOrProjectId.projectId) {
    return prisma.project.findUnique({
      where: { id: taskIdOrProjectId.projectId },
      select: { id: true, slug: true, name: true },
    });
  }

  if (!taskIdOrProjectId.taskId) {
    return null;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskIdOrProjectId.taskId },
    include: { project: { select: { id: true, slug: true, name: true } } },
  });

  return task?.project ?? null;
}

function revalidateTaskPaths(projectSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/decisions");
  if (projectSlug) {
    revalidatePath(`/projects/${projectSlug}`);
  }
}

function buildTaskWriteData(payload: ReturnType<typeof normalizeTask>): Prisma.TaskUncheckedCreateInput {
  const execution = buildTaskExecutionMetadata(payload);
  const timestamps = buildExecutionTimestamps(
    {
      executionStatus: execution.executionStatus,
      startedAt: null,
      completedAt: null,
      failedAt: null,
    },
    execution.executionStatus,
  );

  return {
    projectId: payload.projectId,
    linkedProjectId: execution.linkedProjectId,
    title: payload.title,
    description: payload.description,
    status: execution.status,
    executionMode: payload.executionMode,
    executionStatus: execution.executionStatus,
    priority: payload.priority,
    assignedAgent: payload.assignedAgent,
    githubIssueUrl: payload.githubIssueUrl,
    githubPrUrl: payload.githubPrUrl,
    deployUrl: payload.deployUrl,
    branchName: payload.branchName,
    linkedGithubRepo: payload.linkedGithubRepo,
    linkedGithubIssueNumber: execution.linkedGithubIssueNumber,
    linkedGithubPrNumber: execution.linkedGithubPrNumber,
    linkedGithubBranch: execution.linkedGithubBranch,
    linkedCommitSha: payload.linkedCommitSha,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    failedAt: timestamps.failedAt,
    blockedReason: payload.blockedReason,
    needsDecision: payload.needsDecision,
    nextStep: payload.nextStep,
  };
}

function buildTaskUpdateData(
  previous: {
    executionStatus: TaskExecutionStatus;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
  },
  payload: ReturnType<typeof normalizeTask>,
): Prisma.TaskUncheckedUpdateInput {
  const execution = buildTaskExecutionMetadata(payload);
  const timestamps = buildExecutionTimestamps(previous, execution.executionStatus);

  return {
    projectId: payload.projectId,
    linkedProjectId: execution.linkedProjectId,
    title: payload.title,
    description: payload.description,
    status: execution.status,
    executionMode: payload.executionMode,
    executionStatus: execution.executionStatus,
    priority: payload.priority,
    assignedAgent: payload.assignedAgent,
    githubIssueUrl: payload.githubIssueUrl,
    githubPrUrl: payload.githubPrUrl,
    deployUrl: payload.deployUrl,
    branchName: payload.branchName,
    linkedGithubRepo: payload.linkedGithubRepo,
    linkedGithubIssueNumber: execution.linkedGithubIssueNumber,
    linkedGithubPrNumber: execution.linkedGithubPrNumber,
    linkedGithubBranch: execution.linkedGithubBranch,
    linkedCommitSha: payload.linkedCommitSha,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    failedAt: timestamps.failedAt,
    blockedReason: payload.blockedReason,
    needsDecision: payload.needsDecision,
    nextStep: payload.nextStep,
  };
}

export async function createTaskAction(formData: FormData) {
  const { id: _id, ...payload } = normalizeTask(formData);
  const project = await getProject({ projectId: payload.projectId });

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: buildTaskWriteData(payload),
    });

    await recordTaskEventsFromChanges(tx, null, created, "manual");
    return created;
  });

  revalidateTaskPaths(project?.slug);

  const redirectTo = toNullableString(formData.get("redirectTo"));
  if (redirectTo) {
    redirect(redirectTo);
  }

  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: _id, ...payload } = normalizeTask(formData);
  const previousProjectSlug = toNullableString(formData.get("previousProjectSlug"));

  const existing = await prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { slug: true } },
    },
  });

  if (!existing) {
    redirect("/tasks");
  }

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: buildTaskUpdateData(existing, payload),
      include: {
        project: { select: { slug: true } },
      },
    });

    await recordTaskEventsFromChanges(tx, existing, updated, "manual");
    return updated;
  });

  revalidateTaskPaths(previousProjectSlug ?? undefined);
  revalidateTaskPaths(task.project.slug);
  redirect(`/tasks/${task.id}`);
}

export async function deleteTaskAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const projectSlug = toNullableString(formData.get("projectSlug"));

  await prisma.task.delete({
    where: { id },
  });

  revalidateTaskPaths(projectSlug);
  redirect("/tasks");
}

export async function updateTaskStatusAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const executionStatus = String(formData.get("executionStatus") ?? "") as TaskExecutionStatus;
  const blockedReason = toNullableString(formData.get("blockedReason"));
  const projectSlug = toNullableString(formData.get("projectSlug"));

  const existing = await prisma.task.findUnique({ where: { id } });

  if (!existing) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        executionStatus,
        status: buildTaskExecutionMetadata({
          projectId: existing.projectId,
          executionStatus,
        }).status,
        blockedReason: executionStatus === "blocked" ? blockedReason : null,
        ...buildExecutionTimestamps(existing, executionStatus),
      },
    });

    await recordTaskEventsFromChanges(tx, existing, updated, "manual");
  });

  revalidateTaskPaths(projectSlug);
}

export async function updateTaskAssignmentAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const assignedAgent = String(formData.get("assignedAgent") ?? "");
  const projectSlug = toNullableString(formData.get("projectSlug"));

  const existing = await prisma.task.findUnique({ where: { id } });

  if (!existing) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: { assignedAgent: assignedAgent as never },
    });

    await recordTaskEventsFromChanges(tx, existing, updated, "manual");
  });

  revalidateTaskPaths(projectSlug);
}

export async function toggleTaskBlockedAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const blocked = formData.get("blocked") === "true";
  const blockedReason = toNullableString(formData.get("blockedReason"));
  const projectSlug = toNullableString(formData.get("projectSlug"));

  const existing = await prisma.task.findUnique({ where: { id } });

  if (!existing) {
    return;
  }

  const nextStatus: TaskExecutionStatus = blocked ? "blocked" : "queued";

  await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        executionStatus: nextStatus,
        status: buildTaskExecutionMetadata({
          projectId: existing.projectId,
          executionStatus: nextStatus,
        }).status,
        blockedReason: blocked ? blockedReason : null,
        ...buildExecutionTimestamps(existing, nextStatus),
      },
    });

    await recordTaskEventsFromChanges(tx, existing, updated, "manual");
  });

  revalidateTaskPaths(projectSlug);
}

export async function markTaskDoneAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const projectSlug = toNullableString(formData.get("projectSlug"));

  const existing = await prisma.task.findUnique({ where: { id } });

  if (!existing) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        executionStatus: "done",
        status: "done",
        blockedReason: null,
        ...buildExecutionTimestamps(existing, "done"),
      },
    });

    await recordTaskEventsFromChanges(tx, existing, updated, "manual");
  });

  revalidateTaskPaths(projectSlug);
}
