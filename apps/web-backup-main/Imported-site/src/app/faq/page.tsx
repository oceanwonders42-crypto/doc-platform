import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CTASection from "@/components/ui/CTASection";
import PageHero from "@/components/ui/PageHero";

export default function FAQPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <PageHero
          title="Frequently asked questions"
          subtitle="Complete FAQ: product, integrations, security, and getting started."
        />
        <FAQ />
        <CTASection
          title="Still have questions?"
          description="Schedule a demo and our team will walk you through how Onyx Intel works for your firm."
          primaryLabel="Book a demo"
          primaryHref="/demo"
        />
      </main>
      <Footer />
    </>
  );
}
