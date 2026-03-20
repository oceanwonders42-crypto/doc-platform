"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { slugify, toNullableInt, toNullableString } from "@/lib/utils";
import { projectSchema } from "@/lib/validations";

function normalizeProject(formData: FormData) {
  const rawSlug = String(formData.get("slug") ?? "");

  return projectSchema.parse({
    id: toNullableString(formData.get("id")) ?? undefined,
    name: String(formData.get("name") ?? "").trim(),
    slug: slugify(rawSlug || String(formData.get("name") ?? "")),
    description: toNullableString(formData.get("description")),
    repoUrl: String(formData.get("repoUrl") ?? "").trim(),
    repoName: String(formData.get("repoName") ?? "").trim(),
    defaultBranch: String(formData.get("defaultBranch") ?? "main").trim(),
    deployType: formData.get("deployType"),
    deployTargetName: String(formData.get("deployTargetName") ?? "").trim(),
    deployTargetIdOrHost: String(formData.get("deployTargetIdOrHost") ?? "").trim(),
    environment: formData.get("environment"),
    containerImage: toNullableString(formData.get("containerImage")),
    containerRegistryUrl: toNullableString(formData.get("containerRegistryUrl")),
    publicUrl: toNullableString(formData.get("publicUrl")),
    sshHost: toNullableString(formData.get("sshHost")),
    sshPort: toNullableInt(formData.get("sshPort")),
    sshUser: toNullableString(formData.get("sshUser")),
    appPath: toNullableString(formData.get("appPath")),
    deployMode: toNullableString(formData.get("deployMode")),
    processManager: toNullableString(formData.get("processManager")),
    runtimeServices: toNullableString(formData.get("runtimeServices")),
    deployCommand: toNullableString(formData.get("deployCommand")),
    restartCommand: toNullableString(formData.get("restartCommand")),
    logCommand: toNullableString(formData.get("logCommand")),
    healthCheckUrl: toNullableString(formData.get("healthCheckUrl")),
    internalApiUrl: toNullableString(formData.get("internalApiUrl")),
    internalApiHealthUrl: toNullableString(formData.get("internalApiHealthUrl")),
    internalApiHealthzUrl: toNullableString(formData.get("internalApiHealthzUrl")),
    dockerfileStatus: toNullableString(formData.get("dockerfileStatus")),
    composeUsage: toNullableString(formData.get("composeUsage")),
    isActive: formData.get("isActive") === "on",
  });
}

function revalidateProjectPaths(slug: string) {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/tasks");
  revalidatePath("/decisions");
}

export async function createProjectAction(formData: FormData) {
  const { id: _id, ...payload } = normalizeProject(formData);
  const project = await prisma.project.create({
    data: payload,
  });

  await logActivity({
    projectId: project.id,
    type: "project.created",
    message: `Created project ${project.name}.`,
  });

  revalidateProjectPaths(project.slug);
  redirect(`/projects/${project.slug}`);
}

export async function updateProjectAction(formData: FormData) {
  const { id: _id, ...payload } = normalizeProject(formData);
  const id = String(formData.get("id") ?? "");
  const previousSlug = String(formData.get("previousSlug") ?? payload.slug);

  const project = await prisma.project.update({
    where: { id },
    data: payload,
  });

  await logActivity({
    projectId: project.id,
    type: "project.updated",
    message: `Updated project ${project.name}.`,
  });

  revalidateProjectPaths(previousSlug);
  revalidateProjectPaths(project.slug);
  redirect(`/projects/${project.slug}`);
}

export async function deleteProjectAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "project");

  await prisma.project.delete({
    where: { id },
  });

  await logActivity({
    type: "project.deleted",
    message: `Deleted project ${name}.`,
    metadata: { slug },
  });

  revalidateProjectPaths(slug);
  redirect("/projects");
}
