import Link from "next/link";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";
import { monthlyPlans, paperlessTransition } from "@landing/lib/pricing-data";

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Single combined Services & Pricing section for the homepage.
 * Paperless highlighted; three plans with short summaries; link to full /pricing.
 */
export default function ServicesPricingSection() {
  return (
    <Section id="services-pricing" variant="dark">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Services & pricing"
          title="Automation plans and one-time migration"
          subtitle="Monthly plans with included volume, or a white-glove move to paperless. Full comparison on the pricing page."
        />

        {/* One-time: Paperless Transition */}
        <div className="card mt-14 p-8 md:p-10">
          <p className="landing-eyebrow">
            One-time service
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">
            {paperlessTransition.name}
          </h3>
          <p className="mt-1.5 text-lg font-medium text-[var(--text-primary)]">
            {paperlessTransition.priceLabel}
          </p>
          <p className="mt-5 max-w-2xl text-[var(--text-secondary)] leading-[1.6]">
            {paperlessTransition.description}
          </p>
          <Link
            href="/#services-pricing"
            className="btn-primary mt-6 inline-block text-sm"
          >
            {paperlessTransition.cta}
          </Link>
        </div>

        {/* Monthly plans — short summaries only */}
        <p className="mt-14 landing-eyebrow">
          Monthly plans
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {monthlyPlans.map((plan) => (
            <div
              key={plan.id}
              className={`card p-6 md:p-7 ${
                plan.highlighted
                  ? "ring-1 ring-[var(--border-refined)] border-[var(--border-refined)]"
                  : ""
              }`}
            >
              {plan.highlighted && (
                <span className="text-xs font-medium tracking-wide text-[var(--text-muted)]">
                  Most popular
                </span>
              )}
              <h4 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">{plan.name}</h4>
              <p className="mt-2.5 text-2xl font-semibold text-[var(--text-primary)]">
                {formatPrice(plan.price)}
                <span className="text-sm font-normal text-[var(--text-muted)]">/mo</span>
              </p>
              <p className="mt-3 text-sm leading-[1.55] text-[var(--text-secondary)]">{plan.description}</p>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Up to {plan.documentLimit.toLocaleString()} docs/mo · {plan.overagePerDoc}
              </p>
              <Link
                href="/login"
                className={`mt-6 block w-full rounded-[var(--radius-lg)] py-3 text-center text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center">
          <Link
            href="/#services-pricing"
            className="text-sm font-medium text-[var(--text-muted)] underline decoration-[var(--border-refined)] underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
          >
            Full pricing and comparison →
          </Link>
        </p>
      </div>
    </Section>
  );
}
