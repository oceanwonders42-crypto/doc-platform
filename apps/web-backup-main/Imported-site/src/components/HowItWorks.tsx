import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const steps = [
  { step: "01", title: "Upload", description: "Drag and drop records—PDFs, scans, faxes, portal exports. No manual sorting." },
  { step: "02", title: "Read", description: "AI extracts key data, dates, providers, and billing information from each document." },
  { step: "03", title: "Classify", description: "Documents are categorized by type and matched to the right case automatically." },
  { step: "04", title: "Rename", description: "Files get consistent, searchable names so your team can find what they need." },
  { step: "05", title: "Route", description: "Documents flow into the right folders and workflows based on your rules." },
  { step: "06", title: "Review", description: "Use the dashboard to verify timelines and billing, then sync to your CMS." },
];

export default function HowItWorks() {
  return (
    <Section id="how-it-works" variant="section">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Process"
          title="How it works"
          subtitle="Six steps from upload to synced case data."
        />
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((item, index) => (
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
