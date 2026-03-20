import { notFound } from "next/navigation";

import { deleteDecisionAction, updateDecisionAction } from "@/lib/actions/decisions";
import { getDecisionFormData } from "@/lib/data";

import { DecisionForm } from "@/components/forms/decision-form";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function EditDecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDecisionFormData(id);

  if (!data.decision) {
    notFound();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
      <Panel>
        <SectionHeading title={`Edit ${data.decision.title}`} description="Update the decision text, links, and resolution." />
        <DecisionForm action={updateDecisionAction} decision={data.decision} projects={data.projects} tasks={data.tasks} />
      </Panel>
      <Panel>
        <SectionHeading title="Delete Decision" description="Remove stale decisions that no longer belong in the record." />
        <form action={deleteDecisionAction} className="grid gap-4 p-5">
          <input type="hidden" name="id" value={data.decision.id} />
          <input type="hidden" name="title" value={data.decision.title} />
          <input type="hidden" name="projectSlug" value={data.decision.project?.slug ?? ""} />
          <p className="text-sm text-steel">
            Use deletion sparingly. In most cases, resolve the decision instead so the context stays visible.
          </p>
          <button type="submit" className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white">
            Delete decision
          </button>
        </form>
      </Panel>
    </div>
  );
}
