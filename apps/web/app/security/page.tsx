import Link from "next/link";
import PublicMarketingNav from "../components/PublicMarketingNav";

export const metadata = {
  title: "Security - Onyx Intel",
  description: "Security, access control, and human review practices for Onyx Intel.",
};

const controls = [
  "Firm-scoped data access",
  "Role-based product visibility",
  "Developer-controlled feature flags",
  "Audit-friendly routing decisions",
  "Human review before demand output",
  "No automatic sending of legal work product",
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <PublicMarketingNav />

      <section className="relative overflow-hidden border-b border-[#e5e7eb]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_30%_20%,rgba(37,99,235,0.12),transparent_32%),linear-gradient(180deg,#eff6ff_0%,rgba(255,255,255,0)_72%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Security</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.07em] text-[#0a0a0a] sm:text-6xl">
            Controlled AI workflows for sensitive legal documents.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#525252]">
            Onyx Intel is designed around firm-scoped access, traceable routing, human review, and integration
            boundaries for teams handling medical records, bills, case files, and demand work product.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div>
          <h2 className="text-4xl font-black tracking-[-0.055em]">Security starts with workflow control.</h2>
          <p className="mt-5 text-base leading-7 text-[#525252]">
            The product keeps automation supervised: routing confidence is visible, low-confidence matches can
            fall back to review, and generated legal output remains review-required.
          </p>
          <Link href="/support/report" className="mt-8 inline-flex rounded-full bg-[#0a0a0a] px-5 py-3 text-sm font-black text-white">
            Talk to us
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {controls.map((control) => (
            <div key={control} className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-5">
              <span className="mb-4 block h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
              <p className="text-sm font-black text-[#111111]">{control}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[#e5e7eb] bg-[#fafafa]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-3 lg:px-8">
          {[
            ["Access", "Users see only the firm, role, and feature surfaces they are allowed to use."],
            ["Traceability", "Routing explanations, confidence, previews, and writeback results are designed to leave reviewable evidence."],
            ["Review", "Demand drafts and AI-supported outputs stay human-reviewed and are not auto-sent."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black tracking-[-0.035em]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#525252]">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
