import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const featureBuckets = [
  {
    title: "Document Intelligence",
    description: "AI reads and extracts key data from medical records, bills, and imaging.",
    items: ["Document reading and extraction", "Classification by type and case", "Billing and CPT data extraction"],
  },
  {
    title: "Organization & Routing",
    description: "Keep files structured and get them to the right place.",
    items: ["Smart file renaming", "Case-based routing", "Folder and naming conventions"],
  },
  {
    title: "Provider Intelligence",
    description: "Understand who treated the client and when.",
    items: ["Provider and facility extraction", "Treatment timeline generation", "Chronological case view"],
  },
  {
    title: "Workflow Automation",
    description: "Reduce manual steps from upload to sync.",
    items: ["Review queue for low-confidence items", "CMS sync (Clio, FileVine, and more)", "Configurable field mappings"],
  },
];

export default function Features() {
  return (
    <Section id="features" variant="default">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Product capabilities"
          title="Document intelligence, organization, provider intelligence, automation"
          subtitle="Four capability areas that turn chaotic records into case-ready output."
        />
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {featureBuckets.map((bucket, index) => (
            <div key={index} className="card flex flex-col p-6 md:p-7">
              <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{bucket.title}</h3>
              <p className="mt-2.5 text-sm leading-[1.6] text-[var(--text-secondary)]">{bucket.description}</p>
              <ul className="mt-6 space-y-2.5">
                {bucket.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-[1.5] text-[var(--text-secondary)]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-refined)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
