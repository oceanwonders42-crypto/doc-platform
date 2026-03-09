import CTASection from "@/components/ui/CTASection";
import Features from "@/components/Features";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import IntegrationsSummary from "@/components/IntegrationsSummary";
import ServicesPricingSection from "@/components/ServicesPricingSection";
import Problem from "@/components/Problem";
import Solution from "@/components/Solution";
import WhoUsesOnyxIntel from "@/components/WhoUsesOnyxIntel";
import FAQTeaser from "@/components/FAQTeaser";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <WhoUsesOnyxIntel />
        <Problem />
        <Solution />
        <Features />
        <HowItWorks />
        <ServicesPricingSection />
        <IntegrationsSummary />
        <FAQTeaser />
        <CTASection
          title="Ready to transform your document workflow?"
          description="See how Onyx Intel can work for your firm. 15-minute demo, no commitment."
          primaryLabel="Book a demo"
          primaryHref="/demo"
          secondaryLabel="View pricing"
          secondaryHref="/pricing"
          note="Enterprise security · HIPAA-ready · Built for law firms"
        />
      </main>
      <Footer />
    </>
  );
}
