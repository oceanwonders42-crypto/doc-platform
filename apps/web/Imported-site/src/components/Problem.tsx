import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const painPoints = [
  {
    title: "Too much manual document review",
    description:
      "Staff spend hours reading, sorting, and re-reading the same records. Classification and routing eat into time that could go to case work.",
  },
  {
    title: "Disorganized records",
    description:
      "Medical records arrive in every format—PDFs, faxes, scans—scattered across emails and portals with no structure or consistent naming.",
  },
  {
    title: "Paper-heavy workflows",
    description:
      "Firms stay stuck in paper or semi-digital processes. Moving to a structured, searchable workflow feels out of reach without changing CRMs.",
  },
  {
    title: "Lost time on classification and routing",
    description:
      "Figuring out what each document is, what case it belongs to, and where it should go is repetitive work that slows down every case.",
  },
];

export default function Problem() {
  return (
    <Section id="problem" variant="section">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="The challenge"
          title="Personal injury firms face a document crisis"
          subtitle="Manual review, disorganized records, and paper-heavy workflows drain resources and slow settlements."
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {painPoints.map((point, index) => (
            <div key={index} className="card p-6 md:p-7">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-section)] text-sm font-semibold text-[var(--text-muted)]">
                {index + 1}
              </div>
              <h3 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">{point.title}</h3>
              <p className="mt-2.5 text-sm leading-[1.6] text-[var(--text-secondary)]">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
