"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { refreshProjectRuntime } from "@/lib/runtime-refresh";
import { toNullableString } from "@/lib/utils";

function revalidateRuntimePaths(projectSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/projects");
  if (projectSlug) {
    revalidatePath(`/projects/${projectSlug}`);
  }
}

export async function refreshRuntimeAction(formData: FormData) {
  const projectId = toNullableString(formData.get("projectId"));
  const projectSlug = toNullableString(formData.get("projectSlug"));
  const redirectTo = toNullableString(formData.get("redirectTo"));

  if (!projectId) {
    return;
  }

  await refreshProjectRuntime(projectId);
  revalidateRuntimePaths(projectSlug);

  if (redirectTo) {
    redirect(redirectTo);
  }
}
