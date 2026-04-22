import DashboardPreview from "@/components/DashboardPreview";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import PageCTA from "@/components/PageCTA";

export default function ProductTourPage() {
  const steps = [
    { n: "01", title: "Upload records", desc: "Drag and drop or connect portals. PDFs, scans, faxes—we handle it all." },
    { n: "02", title: "AI processes", desc: "Documents are categorized, indexed, and data is extracted automatically." },
    { n: "03", title: "Review & refine", desc: "Verify timelines and billing data. Override or edit as needed." },
    { n: "04", title: "Sync to your CMS", desc: "Processed documents and structured data flow into your case management system." },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
      <section className="border-b border-[#2A2C2E] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-[#FFFFFF] sm:text-5xl">Product Tour</h1>
          <p className="mt-6 text-lg text-[#B3B6BA]">
            From chaos to clarity in four steps.
          </p>
        </div>
      </section>

      <section className="border-b border-[#2A2C2E] bg-[#121314] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-4xl">
          <div className="space-y-12">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-8 items-start">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#3B82F6]/20 font-mono text-lg font-bold text-[#3B82F6]">{s.n}</div>
                <div>
                  <h3 className="text-xl font-semibold text-[#FFFFFF]">{s.title}</h3>
                  <p className="mt-2 text-[#B3B6BA]">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#2A2C2E] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold text-[#FFFFFF] sm:text-3xl">Live dashboard preview</h2>
          <p className="mt-4 text-[#B3B6BA]">Treatment timelines, provider lists, billing summaries, document categories, and sync status—all in one view.</p>
          <div className="mt-12 max-w-4xl">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <PageCTA
        title="See the full workflow in action"
        description="Schedule a demo to walk through upload, AI processing, review, and sync—live."
      />
      </main>
      <Footer />
    </>
  );
}
