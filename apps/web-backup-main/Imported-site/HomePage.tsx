import CTASection from "@landing/components/ui/CTASection";
import Features from "@landing/components/Features";
import Footer from "@landing/components/Footer";
import Header from "@landing/components/Header";
import Hero from "@landing/components/Hero";
import HowItWorks from "@landing/components/HowItWorks";
import IntegrationsSummary from "@landing/components/IntegrationsSummary";
import ServicesPricingSection from "@landing/components/ServicesPricingSection";
import Problem from "@landing/components/Problem";
import Solution from "@landing/components/Solution";
import WhoUsesOnyxIntel from "@landing/components/WhoUsesOnyxIntel";
import FAQTeaser from "@landing/components/FAQTeaser";

export default function HomePage() {
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
