import { notFound } from "next/navigation";

import { updateProjectAction } from "@/lib/actions/projects";
import { getProjectFormData } from "@/lib/data";

import { ProjectForm } from "@/components/forms/project-form";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectFormData(slug);

  if (!project) {
    notFound();
  }

  return (
    <Panel>
      <SectionHeading title={`Edit ${project.name}`} description="Update repo, deploy, and operator metadata." />
      <ProjectForm action={updateProjectAction} project={project} />
    </Panel>
  );
}
