import Link from "next/link";
import DashboardPreview from "@landing/components/DashboardPreview";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const solutionBullets = [
  "Reads documents and extracts key information automatically",
  "Classifies and tags records by type and case",
  "Renames and organizes files with consistent naming",
  "Routes documents into the right folders and workflows",
  "Organizes case workflows so your team can review and sync to your CMS",
];

export default function Solution() {
  return (
    <Section id="solution" variant="dark">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeader
              eyebrow="The solution"
              title="Structured case data from chaos"
              subtitle="Timelines, provider lists, and billing totals. Review in the dashboard, then sync to your CMS."
              centered={false}
            />
            <ul className="mt-7 space-y-3">
              {solutionBullets.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-refined)]" />
                  <span className="text-[var(--text-secondary)] leading-[1.6]">{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="btn-primary mt-9 inline-block"
            >
              Book a demo
            </Link>
          </div>
          <DashboardPreview />
        </div>
      </div>
    </Section>
  );
}
