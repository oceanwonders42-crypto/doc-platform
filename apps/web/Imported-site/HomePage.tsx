import CTASection from "@landing/components/ui/CTASection";
import DashboardShowcaseSection from "@landing/components/DashboardShowcaseSection";
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
        <DashboardShowcaseSection />
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
          description="Sign in to access the platform dashboard, or book a 15-minute demo—no commitment."
          primaryLabel="Sign in to Dashboard"
          primaryHref="/login"
          secondaryLabel="Book a demo"
          secondaryHref="/login"
          note="Enterprise security · HIPAA-ready · Built for PI firms"
        />
      </main>
      <Footer />
    </>
  );
}
