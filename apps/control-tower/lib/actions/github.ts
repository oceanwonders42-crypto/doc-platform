"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { importGitHubRepo, syncAllGitHubData, syncGitHubProject } from "@/lib/github-sync";
import { toNullableString } from "@/lib/utils";

function revalidateGitHubPaths(projectSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/settings");
  if (projectSlug) {
    revalidatePath(`/projects/${projectSlug}`);
  }
}

export async function syncGitHubAction(formData: FormData) {
  const projectId = toNullableString(formData.get("projectId"));
  const projectSlug = toNullableString(formData.get("projectSlug"));
  const redirectTo = toNullableString(formData.get("redirectTo"));

  if (projectId) {
    await syncGitHubProject(projectId);
  } else {
    await syncAllGitHubData();
  }

  revalidateGitHubPaths(projectSlug);

  if (redirectTo) {
    redirect(redirectTo);
  }
}

export async function importGitHubRepoAction(formData: FormData) {
  const githubRepoId = String(formData.get("githubRepoId") ?? "");
  const result = await importGitHubRepo(githubRepoId);

  revalidateGitHubPaths(result.projectSlug);

  if (result.projectSlug) {
    redirect(`/projects/${result.projectSlug}`);
  }

  redirect("/projects");
}
