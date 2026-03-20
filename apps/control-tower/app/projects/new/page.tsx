import { createProjectAction } from "@/lib/actions/projects";

import { ProjectForm } from "@/components/forms/project-form";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export default function NewProjectPage() {
  return (
    <Panel>
      <SectionHeading title="Create Project" description="Capture repo, deploy, and environment metadata in one place." />
      <ProjectForm action={createProjectAction} />
    </Panel>
  );
}
