import { comparisonRows } from "@/lib/pricing-data";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";

export default function PricingComparisonTable() {
  return (
    <Section variant="dark">
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          eyebrow="Compare plans"
          title="Built for firms ready to scale"
          subtitle="Included volume, support, and overage at a glance."
        />
        <div className="mt-12 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-section)]">
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Feature
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Essential
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Growth
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Premium
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--border-default)] bg-[var(--bg-card)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-medium text-[var(--text-primary)]">
                    {row.label}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                    {row.essential}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                    {row.growth}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                    {row.premium}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
