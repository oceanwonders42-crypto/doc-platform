import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const integrations = [
  "Clio",
  "Filevine",
  "Litify",
  "MyCase",
  "PracticePanther",
  "Smokeball",
];

/**
 * Short integrations block for homepage: CRM list, one line on what syncs, CTA to /integrations.
 */
export default function IntegrationsSummary() {
  return (
    <Section id="integrations" variant="compact">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Integrations"
          title="Works with your CRM"
          subtitle="Processed records, timelines, and billing data sync into your case management system."
        />
        <div className="mt-14 card p-8 md:p-10">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {integrations.map((name) => (
              <div
                key={name}
                className="flex h-12 min-w-[110px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-section)] px-4 text-sm font-medium tracking-wide text-[var(--text-primary)] transition-colors hover:border-[var(--border-refined)]"
              >
                {name}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-7 max-w-md text-center text-sm leading-[1.55] text-[var(--text-secondary)]">
            Configure field mappings once. Your workflow stays intact.
          </p>
          <p className="mt-7 text-center">
            <Link
              href="/integrations"
              className="text-sm font-medium text-[var(--text-muted)] underline decoration-[var(--border-refined)] underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
            >
              Compatibility details →
            </Link>
          </p>
        </div>
      </div>
    </Section>
  );
}
