import DashboardPreview from "@/components/DashboardPreview";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CTASection from "@/components/ui/CTASection";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";

const pillars = [
  {
    title: "Ingest",
    description:
      "Accept records from any source—portals, fax, email, uploads—in PDF, scanned images, or other formats.",
  },
  {
    title: "Organize",
    description:
      "AI categorizes, indexes, and structures documents for fast retrieval, case matching, and compliance.",
  },
  {
    title: "Extract",
    description:
      "Pull treatment dates, billing data, CPT codes, and provider information automatically.",
  },
  {
    title: "Sync",
    description:
      "Push processed documents and structured data into your case management system.",
  },
];

export default function PlatformPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <PageHero
          title="Platform"
          subtitle="How Onyx Intel works: one operational workflow from document intake to organized case output."
        />

        <Section variant="dark">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Workflow"
              title="Four steps"
              subtitle="Ingest, organize, extract, sync."
            />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {pillars.map((pillar, i) => (
                <div key={i} className="card p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-section)] text-sm font-semibold text-[var(--text-muted)]">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold text-[var(--text-primary)]">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{pillar.description}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section variant="section">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Dashboard"
              title="Case Intelligence Dashboard"
              subtitle="Timelines, billing, document categories, and sync status in one view."
            />
            <div className="mt-12 max-w-4xl">
              <DashboardPreview />
            </div>
          </div>
        </Section>

        <CTASection
          title="See the platform in action"
          description="Schedule a demo to walk through the workflow and dashboard."
          primaryLabel="Book a demo"
          primaryHref="/demo"
        />
      </main>
      <Footer />
    </>
  );
}
