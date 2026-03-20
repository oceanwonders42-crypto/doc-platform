"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { toNullableString } from "@/lib/utils";
import { decisionSchema } from "@/lib/validations";

function normalizeDecision(formData: FormData) {
  const taskId = toNullableString(formData.get("taskId"));
  const projectId = toNullableString(formData.get("projectId"));

  return decisionSchema.parse({
    id: toNullableString(formData.get("id")) ?? undefined,
    taskId,
    projectId,
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    status: formData.get("status"),
    resolution: toNullableString(formData.get("resolution")),
  });
}

function revalidateDecisionPaths(projectSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/decisions");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  if (projectSlug) {
    revalidatePath(`/projects/${projectSlug}`);
  }
}

export async function createDecisionAction(formData: FormData) {
  const { id: _id, ...payload } = normalizeDecision(formData);
  const project = payload.projectId
    ? await prisma.project.findUnique({
        where: { id: payload.projectId },
        select: { slug: true },
      })
    : null;

  const decision = await prisma.decisionItem.create({
    data: payload,
  });

  await logActivity({
    projectId: payload.projectId ?? undefined,
    taskId: payload.taskId ?? undefined,
    type: "decision.created",
    message: `Opened decision ${decision.title}.`,
  });

  revalidateDecisionPaths(project?.slug);
  redirect("/decisions");
}

export async function updateDecisionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: _id, ...payload } = normalizeDecision(formData);
  const previousProjectSlug = toNullableString(formData.get("previousProjectSlug"));

  const decision = await prisma.decisionItem.update({
    where: { id },
    data: payload,
    include: {
      project: {
        select: { slug: true },
      },
    },
  });

  await logActivity({
    projectId: decision.projectId ?? undefined,
    taskId: decision.taskId ?? undefined,
    type: "decision.updated",
    message: `Updated decision ${decision.title}.`,
  });

  revalidateDecisionPaths(previousProjectSlug);
  revalidateDecisionPaths(decision.project?.slug);
  redirect("/decisions");
}

export async function deleteDecisionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "decision");
  const projectSlug = toNullableString(formData.get("projectSlug"));

  await prisma.decisionItem.delete({
    where: { id },
  });

  await logActivity({
    type: "decision.deleted",
    message: `Deleted decision ${title}.`,
    metadata: { projectSlug },
  });

  revalidateDecisionPaths(projectSlug);
  redirect("/decisions");
}

export async function resolveDecisionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const resolution = toNullableString(formData.get("resolution"));
  const projectSlug = toNullableString(formData.get("projectSlug"));

  const decision = await prisma.decisionItem.update({
    where: { id },
    data: {
      status: resolution ? "resolved" : "open",
      resolution,
    },
  });

  await logActivity({
    projectId: decision.projectId ?? undefined,
    taskId: decision.taskId ?? undefined,
    type: resolution ? "decision.resolved" : "decision.reopened",
    message: resolution ? `Resolved ${decision.title}.` : `Reopened ${decision.title}.`,
  });

  revalidateDecisionPaths(projectSlug);
}
