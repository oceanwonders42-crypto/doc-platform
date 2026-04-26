import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const content = {
  title: "Demand Support",
  description: "Organize medical bills and specials; draft demand sections with case data at hand.",
  body: "Keep medical bills and specials organized by case. Compare bills to treatment records, surface discrepancies, and draft demand sections using extracted chronology and totals. Built for the way PI teams actually work—from intake to demand.",
  bullets: [
    "Medical bills and specials by case",
    "Compare bills to treatment records",
    "Draft demand sections with extracted data",
    "Export-ready totals and summaries",
  ],
};

export default function DemandSupportFeaturePage() {
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
