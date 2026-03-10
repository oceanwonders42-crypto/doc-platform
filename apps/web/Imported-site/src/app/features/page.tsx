import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CTASection from "@/components/ui/CTASection";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import Link from "next/link";

const featureBuckets = [
  {
    title: "Document Intelligence",
    description: "Extract key data from medical records, bills, and imaging. Classification by type and case.",
    items: ["Document reading and extraction", "Classification by type and case", "Billing and CPT data extraction"],
  },
  {
    title: "Organization & Routing",
    description: "Keep files structured and get them to the right place.",
    items: ["Smart file renaming", "Case-based routing", "Folder and naming conventions"],
  },
  {
    title: "Provider Intelligence",
    description: "Understand who treated the client and when.",
    items: ["Provider and facility extraction", "Treatment timeline generation", "Chronological case view"],
  },
  {
    title: "Workflow Automation",
    description: "Fewer manual steps from upload to sync.",
    items: ["Review queue for low-confidence items", "CMS sync", "Configurable field mappings"],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <PageHero
          title="Features"
          subtitle="What the product does: capability buckets and outcomes for personal injury workflows."
        />

        <Section variant="section">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Capabilities"
              title="Document intelligence, organization, provider intelligence, automation"
              subtitle="Four capability areas. For the end-to-end workflow and dashboard, see Platform."
            />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featureBuckets.map((bucket, index) => (
                <div key={index} className="card flex flex-col p-6">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{bucket.title}</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{bucket.description}</p>
                  <ul className="mt-5 space-y-2">
                    {bucket.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-refined)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-10 text-center text-sm text-[var(--text-secondary)]">
              <Link href="/platform" className="font-medium text-[var(--text-primary)] underline decoration-[var(--border-refined)] underline-offset-2 hover:text-[var(--text-muted)]">
                See the workflow and dashboard on Platform →
              </Link>
            </p>
          </div>
        </Section>

        <CTASection
          title="See these capabilities in action"
          description="Schedule a demo to see how they work for your firm."
          primaryLabel="Book a demo"
          primaryHref="/demo"
        />
      </main>
      <Footer />
    </>
  );
}
