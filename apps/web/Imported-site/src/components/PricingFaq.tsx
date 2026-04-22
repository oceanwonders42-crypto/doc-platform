import { pricingFaq } from "@/lib/pricing-data";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";

export default function PricingFaq() {
  return (
    <Section variant="section">
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          eyebrow="FAQ"
          title="Pricing & onboarding"
        />
        <dl className="mt-12 space-y-8">
          {pricingFaq.map((item, i) => (
            <div key={i} className="border-b border-[var(--border-default)] pb-8 last:border-0 last:pb-0">
              <dt className="text-base font-medium text-[var(--text-primary)]">{item.q}</dt>
              <dd className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
