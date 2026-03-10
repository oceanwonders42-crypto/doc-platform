import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const content = {
  title: "Case Dashboard & Reporting",
  description: "Case-centric command center for review queue, workload, and reports.",
  body: "The dashboard is built around cases—not file lists. See active cases, documents received today, needs review, missing records, chronologies in progress, and demands in progress. Review queue, recently updated cases, missing-doc alerts, AI exceptions, overdue records requests, and team workload. Management gets metrics and billing; staff gets tasks and cases.",
  bullets: [
    "Case-centric summary cards and panels",
    "Review queue and AI exceptions",
    "Missing documentation alerts",
    "Role-based visibility (management vs staff)",
  ],
};

export default function CaseDashboardFeaturePage() {
  return (
    <Section id="feature" variant="default">
      <div className="mx-auto max-w-3xl">
        <Link href="/#platform-modules" className="text-sm font-medium text-[var(--accent-blue)] hover:underline">
          ← Platform
        </Link>
        <SectionHeader
          eyebrow="Feature"
          title={content.title}
          subtitle={content.description}
          centered={false}
          className="mt-4"
        />
        <p className="mt-6 text-[var(--text-secondary)] leading-[1.65]">{content.body}</p>
        <ul className="mt-6 space-y-2">
          {content.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-refined)]" />
              {b}
            </li>
          ))}
        </ul>
        <Link href="/login" className="btn-primary mt-10 inline-block">
          Book a demo
        </Link>
      </div>
    </Section>
  );
}
