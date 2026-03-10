import Link from "next/link";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import { monthlyPlans, paperlessTransition } from "@/lib/pricing-data";

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ServicesOverview() {
  return (
    <Section id="services" variant="dark">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Services"
          title="Automation plans and one-time migration"
          subtitle="Clear separation: monthly document workflow plans, or a white-glove move to paperless. No blending product features with service tiers."
        />

        {/* One-time: Paperless Transition */}
        <div className="mt-16 rounded-xl border border-[#2A2C2E] bg-[#121314] p-8 md:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#a1a1aa]">
            One-time service
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
            {paperlessTransition.name}
          </h3>
          <p className="mt-1 text-lg font-medium text-white">
            {paperlessTransition.priceLabel}
          </p>
          <p className="mt-4 max-w-2xl text-[#b3b6ba]">
            {paperlessTransition.description}
          </p>
          <Link
            href="/pricing#paperless"
            className="btn-primary mt-5 inline-block text-sm"
          >
            {paperlessTransition.cta}
          </Link>
        </div>

        {/* Monthly plans: Essential, Growth, Premium */}
        <p className="mt-14 text-xs font-medium uppercase tracking-[0.2em] text-[#a1a1aa]">
          Monthly automation plans
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {monthlyPlans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 transition-all duration-200 ${
                plan.highlighted
                  ? "border-[#3d3e40] bg-[#121314] ring-1 ring-[#3d3e40]"
                  : "border-[#2A2C2E] bg-[#181A1B] hover:border-[#3d3e40]"
              }`}
            >
              {plan.highlighted && (
                <span className="text-xs font-medium tracking-wide text-[#a1a1aa]">
                  Most popular
                </span>
              )}
              <h4 className="mt-1 text-lg font-semibold text-white">{plan.name}</h4>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatPrice(plan.price)}
                <span className="text-sm font-normal text-[#a1a1aa]">/mo</span>
              </p>
              <p className="mt-3 text-sm text-[#b3b6ba]">{plan.description}</p>
              <p className="mt-3 text-xs text-[#a1a1aa]">
                Up to {plan.documentLimit.toLocaleString()} docs/mo · {plan.overagePerDoc}
              </p>
              <Link
                href="/pricing"
                className={`mt-5 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? "btn-primary"
                    : "ring-1 ring-[#2A2C2E] text-white hover:ring-[#3d3e40] hover:bg-[#121314]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center">
          <Link
            href="/pricing"
            className="text-sm font-medium text-[#a1a1aa] underline decoration-[#3d3e40] underline-offset-2 hover:text-white"
          >
            Full pricing and comparison →
          </Link>
        </p>
      </div>
    </Section>
  );
}
