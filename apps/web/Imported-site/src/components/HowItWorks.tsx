import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const steps = [
  { step: "01", title: "Upload records", description: "Drag and drop or sync from portals. PDFs, scans, faxes—all in one place." },
  { step: "02", title: "AI extracts and organizes", description: "Key data, dates, providers, and billing are extracted and categorized by type and case." },
  { step: "03", title: "Chronology and costs generated", description: "Treatment timelines and medical bill totals are built automatically from extracted data." },
  { step: "04", title: "Missing records flagged", description: "Gaps in treatment or documentation are surfaced so you can request what’s needed." },
  { step: "05", title: "Team reviews and finalizes", description: "Review queue for exceptions; then sync to your CMS and finalize demands and work product." },
];

export default function HowItWorks() {
  return (
    <Section id="how-it-works" variant="section">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Process"
          title="How it works"
          subtitle="Five steps from upload to finalized case work."
        />
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {steps.slice(0, 5).map((item, index) => (
            <div key={index} className="card flex flex-col p-6 md:p-7">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-section)] font-mono text-sm font-semibold text-[var(--text-muted)]">
                {item.step}
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-[1.6] text-[var(--text-secondary)]">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
