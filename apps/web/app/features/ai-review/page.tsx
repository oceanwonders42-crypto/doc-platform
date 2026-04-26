import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const content = {
  title: "AI Review",
  description: "Extract key data and send low-confidence items to your review queue.",
  body: "AI reads medical records, bills, and imaging reports—extracting providers, dates, diagnoses, procedures, and billing data. High-confidence extractions flow into timelines and reports; low-confidence or ambiguous items land in the review queue so staff can verify before sync.",
  bullets: [
    "Provider, date, and diagnosis extraction",
    "Billing and CPT data extraction",
    "Confidence scoring and review queue",
    "Exception handling and corrections",
  ],
};

export default function AIReviewFeaturePage() {
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
