"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { runAutomationJob } from "@/lib/automation-jobs";
import { toNullableString } from "@/lib/utils";

function revalidateAutomationPaths(projectSlug?: string | null, taskId?: string | null) {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/settings");
  if (projectSlug) {
    revalidatePath(`/projects/${projectSlug}`);
  }
  if (taskId) {
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/tasks/${taskId}/edit`);
  }
}

export async function runAutomationJobAction(formData: FormData) {
  const action = String(formData.get("action") ?? "");
  const projectId = toNullableString(formData.get("projectId"));
  const projectSlug = toNullableString(formData.get("projectSlug"));
  const taskId = toNullableString(formData.get("taskId"));
  const promptTarget = toNullableString(formData.get("promptTarget"));
  const redirectTo = toNullableString(formData.get("redirectTo"));
  const scopeLabel = toNullableString(formData.get("scopeLabel"));

  await runAutomationJob({
    action: action as never,
    projectId,
    taskId,
    promptTarget: promptTarget as never,
    requestedBy: "operator",
    scopeLabel,
  });

  revalidateAutomationPaths(projectSlug, taskId);

  if (redirectTo) {
    redirect(redirectTo);
  }
}
