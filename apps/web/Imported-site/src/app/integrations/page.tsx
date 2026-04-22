import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CTASection from "@/components/ui/CTASection";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";

const integrations = [
  "Clio",
  "Filevine",
  "Litify",
  "MyCase",
  "PracticePanther",
  "Smokeball",
];

const syncItems = [
  { title: "Organized documents", desc: "Categorized and indexed medical records in the correct case folders." },
  { title: "Treatment timelines", desc: "Chronological narratives with dates, providers, and visit types." },
  { title: "Billing data", desc: "Itemized charges, CPT codes, and totals in structured fields." },
  { title: "Provider lists", desc: "Extracted provider and facility information linked to the case." },
];

export default function IntegrationsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <PageHero
          title="Integrations"
          subtitle="Supported CRMs, what syncs, and how we fit your existing stack."
        />

        <Section variant="dark">
          <div className="mx-auto max-w-6xl">
            <p className="mx-auto max-w-2xl text-center text-sm leading-relaxed text-[var(--text-secondary)]">
              Onyx Intel plugs into your existing case management. You keep your CRM; we handle document intelligence and sync. One-time setup.
            </p>
            <div className="mt-10">
              <SectionHeader
                eyebrow="Supported systems"
                title="Case management systems"
                subtitle="Processed records, timelines, and billing data flow into your CMS."
              />
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
              {integrations.map((name) => (
                <div
                  key={name}
                  className="card flex h-14 min-w-[130px] items-center justify-center px-5 text-sm font-medium text-[var(--text-primary)]"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section variant="section">
          <div className="mx-auto max-w-4xl">
            <SectionHeader
              eyebrow="What syncs"
              title="What syncs into your CMS"
              subtitle="Field mappings stay under your control."
            />
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {syncItems.map((item, i) => (
                <div key={i} className="card p-6">
                  <h3 className="font-semibold text-[var(--text-primary)]">{item.title}</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <CTASection
          title="Connect Onyx Intel to your stack"
          description="Schedule a demo to see how integration works for your CRM."
          primaryLabel="Book a demo"
          primaryHref="/demo"
        />
      </main>
      <Footer />
    </>
  );
}
