import CTASection from "@landing/components/ui/CTASection";
import Features from "@landing/components/Features";
import Footer from "@landing/components/Footer";
import Header from "@landing/components/Header";
import Hero from "@landing/components/Hero";
import HowItWorks from "@landing/components/HowItWorks";
import IntegrationsSummary from "@landing/components/IntegrationsSummary";
import PlatformModules from "@landing/components/PlatformModules";
import ServicesPricingSection from "@landing/components/ServicesPricingSection";
import Problem from "@landing/components/Problem";
import Solution from "@landing/components/Solution";
import WhoUsesOnyxIntel from "@landing/components/WhoUsesOnyxIntel";
import FAQTeaser from "@landing/components/FAQTeaser";
import RoleVisibilitySection from "@landing/components/RoleVisibilitySection";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <WhoUsesOnyxIntel />
        <PlatformModules />
        <Features />
        <HowItWorks />
        <Solution />
        <RoleVisibilitySection />
        <ServicesPricingSection />
        <IntegrationsSummary />
        <FAQTeaser />
        <CTASection
          id="contact"
          title="Ready to turn records into case-ready output?"
          description="See how Onyx Intel can work for your firm. Book a 15-minute demo—no commitment."
          primaryLabel="Book a demo"
          primaryHref="/login"
          secondaryLabel="See Platform"
          secondaryHref="/#platform-modules"
          note="Enterprise security · HIPAA-ready · Built for PI firms"
        />
      </main>
      <Footer />
    </>
  );
}
