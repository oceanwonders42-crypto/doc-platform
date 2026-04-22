import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const views = [
  {
    title: "Management",
    description: "Billing, performance, usage, and firm settings. High-level metrics and controls—not visible to staff.",
  },
  {
    title: "Staff & paralegal",
    description: "Assigned cases, documents to review, records requests, and pending tasks. Operational view only.",
  },
  {
    title: "Reviewer",
    description: "Review queue, duplicate checks, extraction exceptions, and unresolved items. QA-focused workflow.",
  },
];

export default function RoleVisibilitySection() {
  return (
    <Section id="role-visibility" variant="section">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Visibility"
          title="The right view for every role"
          subtitle="Management sees metrics and billing; staff sees cases and tasks. No information leakage between roles."
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {views.map((v) => (
            <div key={v.title} className="card p-6 md:p-7">
              <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{v.title}</h3>
              <p className="mt-3 text-sm leading-[1.6] text-[var(--text-secondary)]">{v.description}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
