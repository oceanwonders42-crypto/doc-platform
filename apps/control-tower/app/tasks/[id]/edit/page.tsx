import { notFound } from "next/navigation";

import { deleteTaskAction, updateTaskAction } from "@/lib/actions/tasks";
import { getTaskFormData } from "@/lib/data";

import { TaskForm } from "@/components/forms/task-form";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTaskFormData(id);

  if (!data.task) {
    notFound();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
      <Panel>
        <SectionHeading title={`Edit ${data.task.title}`} description="Update status, links, ownership, and next steps." />
        <TaskForm action={updateTaskAction} task={data.task} projects={data.projects} />
      </Panel>
      <Panel>
        <SectionHeading title="Delete Task" description="Remove this task from the board if it is no longer relevant." />
        <form action={deleteTaskAction} className="grid gap-4 p-5">
          <input type="hidden" name="id" value={data.task.id} />
          <input type="hidden" name="title" value={data.task.title} />
          <input type="hidden" name="projectSlug" value={data.task.project.slug} />
          <p className="text-sm text-steel">
            Deleting the task also removes its direct task references from the working set.
          </p>
          <button type="submit" className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white">
            Delete task
          </button>
        </form>
      </Panel>
    </div>
  );
}
