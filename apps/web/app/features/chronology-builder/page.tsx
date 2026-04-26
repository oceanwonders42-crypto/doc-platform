import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const content = {
  title: "Chronology Builder",
  description: "Auto-build treatment timelines from extracted data.",
  body: "Turn extracted dates and providers into a clear treatment chronology. Filter by track (medical, legal, insurance) and provider. Export for demand packages and case strategy. Built from the same data that powers your case dashboard—no re-entry.",
  bullets: [
    "Automatic timeline from document extractions",
    "Filter by track and provider",
    "Export for demands and case memos",
    "Uncertain dates flagged for review",
  ],
};

export default function ChronologyBuilderFeaturePage() {
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
        <Link href="/demo" className="btn-primary mt-10 inline-block">
          Book a demo
        </Link>
      </div>
    </Section>
  );
}
