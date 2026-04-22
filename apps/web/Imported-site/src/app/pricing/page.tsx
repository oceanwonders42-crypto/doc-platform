import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import CTASection from "@/components/ui/CTASection";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import PricingComparisonTable from "@/components/PricingComparisonTable";
import PricingFaq from "@/components/PricingFaq";
import {
  monthlyPlans,
  paperlessTransition,
} from "@/lib/pricing-data";

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <PageHero
          title="Pricing"
          subtitle="Monthly automation plans with included document volume, plus a one-time Paperless Transition service. Compare plans below."
        />

        <Section variant="dark" className="!py-20 md:!py-24">
          <div className="mx-auto max-w-4xl">
            <SectionHeader
              eyebrow="Services"
              title="Automation plans and one-time migration"
              subtitle="Monthly plans with included volume, or a one-time migration for firms ready to go paperless."
            />
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Automation plans</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Monthly subscription with included document volume. Overage pricing if you exceed your plan.
                </p>
              </div>
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Paperless Transition</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  One-time migration and setup. Move from paper to a structured digital workflow, regardless of CRM.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section variant="default">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Monthly plans"
              title="Choose your plan"
              subtitle="Match your volume and workflow needs."
            />

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {monthlyPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-[var(--radius-lg)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-card)] transition-all duration-200 ${
                    plan.highlighted
                      ? "ring-1 ring-[var(--border-refined)] border border-[var(--border-refined)] lg:-mt-1 lg:mb-1"
                      : "border border-[var(--border-default)] hover:border-[var(--border-refined)] hover:shadow-[var(--shadow-card-hover)]"
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium tracking-wide text-[var(--text-muted)] ring-1 ring-[var(--border-default)]">
                      Most popular
                    </div>
                  )}
                  <h3 className="text-xl font-semibold text-[var(--text-primary)]">{plan.name}</h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{plan.description}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
                      {formatPrice(plan.price)}
                    </span>
                    <span className="text-[var(--text-muted)]">/mo</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-refined)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-[var(--text-muted)]">Overage: {plan.overagePerDoc}</p>
                  <Link
                    href="/demo"
                    className={`mt-6 block w-full py-3.5 text-center text-sm font-semibold transition-all rounded-[var(--radius-lg)] ${
                      plan.highlighted ? "btn-primary" : "btn-secondary"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section id="paperless" variant="dark">
          <div className="mx-auto max-w-4xl">
            <div className="card p-8 md:p-10">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                One-time service
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">
                {paperlessTransition.name}
              </h2>
              <p className="mt-2 text-xl font-medium text-[var(--text-primary)]">
                {paperlessTransition.priceLabel}
              </p>
              <p className="mt-6 text-[var(--text-secondary)] leading-relaxed">
                {paperlessTransition.description}
              </p>
              <ul className="mt-8 space-y-3">
                {paperlessTransition.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-refined)]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/demo" className="btn-primary mt-8 inline-block">
                {paperlessTransition.cta}
              </Link>
            </div>
          </div>
        </Section>

        <PricingComparisonTable />
        <PricingFaq />

        <CTASection
          title="Find the right plan"
          description="Book a demo to discuss volume and plan fit."
          primaryLabel="Book a demo"
          primaryHref="/demo"
        />
      </main>
      <Footer />
    </>
  );
}
