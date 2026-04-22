import Link from "next/link";
import DashboardPreview from "@landing/components/DashboardPreview";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

/**
 * Prominent dashboard preview section for the homepage.
 * Reuses the marketing DashboardPreview component; CTAs point to /login.
 */
export default function DashboardShowcaseSection() {
  return (
    <Section id="dashboard-preview" variant="section">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="The product"
          title="See the platform dashboard"
          subtitle="Cases, timelines, billing extracted, and documents—all in one place. Sign in to access the full dashboard or book a demo."
          centered={true}
        />
        <div className="mt-12">
          <DashboardPreview />
        </div>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link href="/login" className="btn-primary w-full min-w-[10rem] sm:w-auto">
            Sign in to Dashboard
          </Link>
          <Link href="/login" className="btn-secondary w-full min-w-[10rem] sm:w-auto">
            Book a Demo
          </Link>
        </div>
      </div>
    </Section>
  );
}
