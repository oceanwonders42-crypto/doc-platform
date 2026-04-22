import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const modules = [
  {
    id: "document-intake",
    title: "Document Intake",
    description: "Centralize records from portals, fax, email, and uploads. One place for every document before AI processes it.",
    href: "/features/document-intake",
  },
  {
    id: "ai-review",
    title: "AI Review",
    description: "Extract providers, dates, diagnoses, procedures, and billing data. Low-confidence items go to your review queue.",
    href: "/features/ai-review",
  },
  {
    id: "chronology-builder",
    title: "Chronology Builder",
    description: "Auto-build treatment timelines from extracted data. Filter by track and provider; export for demands and case strategy.",
    href: "/features/chronology-builder",
  },
  {
    id: "missing-records",
    title: "Missing Records Detection",
    description: "Flag gaps in treatment or billing so you know what to request before drafting the demand.",
    href: "/features/missing-records",
  },
  {
    id: "demand-support",
    title: "Demand Support",
    description: "Organize medical bills and specials. Compare bills to treatment records and draft demand sections with case data at hand.",
    href: "/features/demand-support",
  },
  {
    id: "case-dashboard",
    title: "Dashboard & Reporting",
    description: "Case-centric command center: review queue, workload, missing-doc alerts, and reports for management and staff.",
    href: "/features/case-dashboard",
  },
];

export default function PlatformModules() {
  return (
    <Section id="platform-modules" variant="default">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Platform"
          title="Document intelligence and case workflow in one place"
          subtitle="From intake to demand—AI-powered modules built for PI document workflows."
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => (
            <Link
              key={mod.id}
              href={mod.href}
              className="card flex flex-col p-6 md:p-7 transition-all duration-200 hover:border-[var(--border-refined)]"
            >
              <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{mod.title}</h3>
              <p className="mt-2.5 text-sm leading-[1.6] text-[var(--text-secondary)]">{mod.description}</p>
              <span className="mt-4 text-sm font-medium text-[var(--accent-blue)]">Learn more →</span>
            </Link>
          ))}
        </div>
      </div>
    </Section>
  );
}
