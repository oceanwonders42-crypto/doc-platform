import Link from "next/link";
import { monthlyPlans, paperlessTransition } from "@/lib/pricing-data";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PricingSection() {
  return (
    <Section id="pricing" variant="dark">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Pricing"
          title="Choose the right workflow"
          subtitle="Monthly plans with included document volume, plus a one-time migration service for firms ready to go paperless."
        />

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {monthlyPlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl bg-[#121314] p-8 ring-1 transition-all duration-200 hover:ring-[#3d3e40] ${
                plan.highlighted
                  ? "ring-[#3d3e40] lg:-mt-1 lg:mb-1"
                  : "ring-[#2A2C2E]"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0f0f10] px-3 py-1 text-xs font-medium tracking-wide text-[#a1a1aa] ring-1 ring-[#252628]">
                  Most popular
                </div>
              )}
              <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-[#b3b6ba]">{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight text-white">
                  {formatPrice(plan.price)}
                </span>
                <span className="text-[#a1a1aa]">/mo</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#b3b6ba]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3d3e40]" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-[#a1a1aa]">Overage: {plan.overagePerDoc}</p>
              <Link
                href="/demo"
                className={`mt-6 block w-full rounded-xl py-3.5 text-center text-sm font-semibold transition-all ${
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

        <div className="mt-16 rounded-xl border border-[#2A2C2E] bg-[#121314] p-8 md:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#a1a1aa]">
                One-time service
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {paperlessTransition.name}
              </h3>
              <p className="mt-2 text-lg font-medium text-white">
                {paperlessTransition.priceLabel}
              </p>
              <p className="mt-4 max-w-xl text-[#b3b6ba]">
                {paperlessTransition.description}
              </p>
              <ul className="mt-6 space-y-2">
                {paperlessTransition.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#b3b6ba]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3d3e40]" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/demo"
              className="btn-primary shrink-0 md:self-center"
            >
              {paperlessTransition.cta}
            </Link>
          </div>
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
