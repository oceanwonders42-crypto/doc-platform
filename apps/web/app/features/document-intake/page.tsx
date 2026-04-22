import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const content = {
  title: "Document Intake",
  description: "Centralize every record in one place before AI processes it.",
  body: "Bring in documents from portals, fax, email, and direct upload. One intake pipeline for your firm—no more scattered PDFs or manual sorting. Onyx Intel ingests, then routes and extracts so your team works from a single source of truth.",
  bullets: [
    "Portal sync and bulk upload",
    "Consistent naming and folder structure",
    "Case-based routing rules",
    "Ready for AI extraction and chronology",
  ],
};

export default function DocumentIntakeFeaturePage() {
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
