import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

type UserGroup = {
  title: string;
  description: string;
};

const users: UserGroup[] = [
  {
    title: "Personal Injury Law Firms",
    description:
      "Organize medical records, route documents correctly, and reduce manual review time across your cases.",
  },
  {
    title: "Case Managers",
    description:
      "Keep files organized, track records faster, and avoid losing time sorting through unstructured documents.",
  },
  {
    title: "Litigation Support Staff",
    description:
      "Prepare cleaner case files with structured records, extracted billing data, and organized documentation.",
  },
  {
    title: "Pre-Suit and Litigation Teams",
    description:
      "From intake to demand package—streamline the entire medical records workflow. Get timelines and billing data ready when you need them.",
  },
];

/**
 * Who it's for — aligned with site visual system (same Section, borders, no amber).
 */
export default function WhoUsesOnyxIntel() {
  return (
    <Section id="who-uses" variant="section">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Who it's for"
          title="Built for personal injury teams handling document-heavy cases"
          subtitle="Firms, case managers, litigation support, and pre-suit teams—from intake through settlement."
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {users.map((user) => (
            <div key={user.title} className="card p-6 md:p-7">
              <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{user.title}</h3>
              <p className="mt-3 text-sm leading-[1.6] text-[var(--text-secondary)]">{user.description}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
