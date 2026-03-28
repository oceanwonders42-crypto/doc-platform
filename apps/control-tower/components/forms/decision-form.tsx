import type { DecisionItem } from "@prisma/client";

import { decisionStatusLabels, decisionStatusOptions } from "@/lib/constants";

import { Field, Input, Select, Textarea } from "@/components/ui/form-inputs";

type DecisionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  decision?: (DecisionItem & { project?: { slug: string } | null }) | null;
  projects: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string; title: string }>;
};

export function DecisionForm({ action, decision, projects, tasks }: DecisionFormProps) {
  return (
    <form action={action} className="grid gap-5 p-5">
      {decision ? <input type="hidden" name="id" value={decision.id} /> : null}
      {decision?.project?.slug ? <input type="hidden" name="previousProjectSlug" value={decision.project.slug} /> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Decision title" htmlFor="title">
          <Input id="title" name="title" defaultValue={decision?.title ?? ""} required />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={decision?.status ?? "open"}>
            {decisionStatusOptions.map((status) => (
              <option key={status} value={status}>
                {decisionStatusLabels[status]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={decision?.description ?? ""} required />
      </Field>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Linked project" htmlFor="projectId">
          <Select id="projectId" name="projectId" defaultValue={decision?.projectId ?? ""}>
            <option value="">No linked project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Linked task" htmlFor="taskId">
          <Select id="taskId" name="taskId" defaultValue={decision?.taskId ?? ""}>
            <option value="">No linked task</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Resolution" htmlFor="resolution">
        <Textarea id="resolution" name="resolution" defaultValue={decision?.resolution ?? ""} />
      </Field>

      <div className="flex justify-end">
        <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white" type="submit">
          {decision ? "Save decision" : "Create decision"}
        </button>
      </div>
    </form>
  );
}
