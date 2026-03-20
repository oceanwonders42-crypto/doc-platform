import Link from "next/link";

import { createDecisionAction, resolveDecisionAction } from "@/lib/actions/decisions";
import { getDecisions } from "@/lib/data";
import { formatDateOnly } from "@/lib/utils";

import { DecisionForm } from "@/components/forms/decision-form";
import { DecisionStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/form-inputs";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function DecisionsPage() {
  const data = await getDecisions();
  const openDecisions = data.decisions.filter((decision) => decision.status === "open");
  const resolvedDecisions = data.decisions.filter((decision) => decision.status === "resolved");

  return (
    <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
      <div className="grid gap-6">
        <Panel>
          <SectionHeading title="Open Decisions" description="Unresolved operator choices that still affect delivery." />
          <div className="grid gap-4 p-5">
            {openDecisions.length === 0 ? (
              <EmptyState title="No open decisions" description="The portfolio is not currently waiting on unresolved choices." />
            ) : (
              openDecisions.map((decision) => (
                <div key={decision.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <DecisionStatusBadge status={decision.status} />
                    <Link href={`/decisions/${decision.id}/edit`} className="text-sm font-medium text-signal hover:underline">
                      Edit
                    </Link>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-ink">{decision.title}</p>
                  <p className="mt-2 text-sm text-steel">{decision.description}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-steel">
                    {decision.project ? (
                      <Link href={`/projects/${decision.project.slug}`} className="text-signal hover:underline">
                        {decision.project.name}
                      </Link>
                    ) : null}
                    {decision.task ? <span>{decision.task.title}</span> : null}
                    <span>Created {formatDateOnly(decision.createdAt)}</span>
                  </div>
                  <form action={resolveDecisionAction} className="mt-4 grid gap-3">
                    <input type="hidden" name="id" value={decision.id} />
                    <input type="hidden" name="projectSlug" value={decision.project?.slug ?? ""} />
                    <Field label="Resolution" htmlFor={`resolution-${decision.id}`}>
                      <Textarea
                        id={`resolution-${decision.id}`}
                        name="resolution"
                        placeholder="Capture the choice and the rule going forward"
                        className="min-h-24"
                      />
                    </Field>
                    <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white">
                      Resolve decision
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="Resolved Decisions" description="Recent resolved calls for reference and policy carry-forward." />
          <div className="grid gap-4 p-5">
            {resolvedDecisions.length === 0 ? (
              <EmptyState title="No resolved decisions" description="Resolved decisions will land here once captured." />
            ) : (
              resolvedDecisions.map((decision) => (
                <div key={decision.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <DecisionStatusBadge status={decision.status} />
                    <Link href={`/decisions/${decision.id}/edit`} className="text-sm font-medium text-signal hover:underline">
                      Edit
                    </Link>
                  </div>
                  <p className="mt-3 font-semibold text-ink">{decision.title}</p>
                  {decision.resolution ? <p className="mt-2 text-sm text-steel">{decision.resolution}</p> : null}
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeading title="Create Decision" description="Capture choices that should not stay buried in chat threads." />
        <DecisionForm action={createDecisionAction} projects={data.projects} tasks={data.tasks} />
      </Panel>
    </div>
  );
}
