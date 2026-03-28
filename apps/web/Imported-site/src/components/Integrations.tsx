import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";

const integrations = [
  "Clio",
  "Filevine",
  "Litify",
  "MyCase",
  "PracticePanther",
  "Smokeball",
];

export default function Integrations() {
  return (
    <Section id="integrations" variant="default">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Integrations"
          title="Works with your CRM"
          subtitle="Onyx Intel syncs processed documents and structured data into your existing case management system. No rip-and-replace."
        />
        <div className="mt-12 rounded-xl border border-[#2A2C2E] bg-[#121314] p-8 md:p-10">
          <p className="text-center text-xs font-medium uppercase tracking-[0.15em] text-[#a1a1aa]">
            Supported case management systems
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {integrations.map((name) => (
              <div
                key={name}
                className="flex h-12 min-w-[120px] items-center justify-center rounded-lg border border-[#2A2C2E] bg-[#181A1B] px-4 text-sm font-medium text-white transition-colors hover:border-[#3d3e40]"
              >
                {name}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-xl text-center text-sm text-[#b3b6ba]">
            Configure field mappings once. Processed records, timelines, and billing data flow into your CMS.
          </p>
        </div>
      </div>
    </Section>
  );
}
