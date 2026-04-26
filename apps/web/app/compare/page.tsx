import Link from "next/link";
import PublicMarketingFooter from "../components/PublicMarketingFooter";
import PublicMarketingNav from "../components/PublicMarketingNav";

export const metadata = {
  title: "Onyx Intel vs generic legal document tools",
  description:
    "A factual comparison of generic legal document tools and Onyx Intel's focused legal document-to-demand automation layer.",
};

const rows = [
  {
    capability: "Firm email PDF ingestion",
    generic: "Often handled through manual download, forwarding, or separate intake setup.",
    onyx: "Connect firm email inboxes and ingest PDFs automatically. Gmail OAuth is supported as the first email workflow.",
  },
  {
    capability: "OCR + classification",
    generic: "May require a standalone OCR tool or manual document labeling.",
    onyx: "OCR and classification feed the shared case review pipeline.",
  },
  {
    capability: "AI case routing with confidence/reasoning",
    generic: "Case assignment may be manual or rule-based unless custom AI routing is configured.",
    onyx: "AI routing stores confidence, reasoning, and source fields so teams can see why a document moved.",
  },
  {
    capability: "Review fallback",
    generic: "Low-confidence items may need manual tracking outside the tool.",
    onyx: "Uncertain matches can stay in review instead of being auto-attached to a case.",
  },
  {
    capability: "Chronology generation",
    generic: "Chronologies are often drafted manually or assembled from separate exports.",
    onyx: "Chronology generation uses uploaded records and keeps source context visible for review.",
  },
  {
    capability: "Missing records analysis",
    generic: "Usually checked by staff comparing treatment history against collected records.",
    onyx: "Onyx Intel highlights gaps and recommends records requests from case evidence.",
  },
  {
    capability: "Bills vs treatment comparison",
    generic: "Often reviewed in spreadsheets or manually across bills and medical records.",
    onyx: "Billing records can be compared against treatment evidence to flag mismatches.",
  },
  {
    capability: "Records request drafting",
    generic: "May require separate templates and manual provider selection.",
    onyx: "Records requests are created from missing-records context and provider data.",
  },
  {
    capability: "Demand template control",
    generic: "Templates may live in documents or require separate configuration.",
    onyx: "Developer-controlled templates can be assigned globally or per firm for review-ready demands.",
  },
  {
    capability: "Demand PDF generation",
    generic: "Demand packets may require manual copy, paste, and PDF assembly.",
    onyx: "Demand PDFs are generated from case data, treatment, bills, missing records, and active templates.",
  },
  {
    capability: "Clio note writeback",
    generic: "May depend on exports, manual notes, or separate integration work.",
    onyx: "Clio note writeback is part of the connected workflow for authorized firms.",
  },
  {
    capability: "Firm/admin access controls",
    generic: "Access controls vary by product and often focus on broad document permissions.",
    onyx: "Firm admins and developer controls manage roles, features, plan limits, and integrations.",
  },
  {
    capability: "Floating case assistant",
    generic: "Assistant features may not be case-aware without custom context setup.",
    onyx: "The assistant can work from firm context or current case context while staying scoped.",
  },
  {
    capability: "Provider map",
    generic: "Provider lookup may be separate from case and records-request workflows.",
    onyx: "Provider map data supports case work, provider details, and records-request history when available.",
  },
];

const proofPoints = [
  "Case-aware, not just file-aware",
  "Review fallback for uncertain routing",
  "Demand templates controlled by firm/developer settings",
  "No public pricing or unsupported competitor claims",
];

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-[#f3f4f6] text-[#0a0a0a]">
      <PublicMarketingNav />

      <section className="relative overflow-hidden border-b border-[#e5e7eb]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_34%),linear-gradient(180deg,#f8fbff_0%,rgba(243,244,246,0)_78%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Comparison</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.07em] text-[#0a0a0a] sm:text-6xl">
            Onyx Intel vs generic legal document tools
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#525252]">
            Many legal platforms help organize files. Onyx Intel is built as a focused legal
            document-to-demand automation layer for intake, routing, review, chronology, requests, demands,
            and Clio writeback.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className="rounded-full bg-[#0a0a0a] px-6 py-3 text-sm font-black text-white transition hover:bg-[#2563eb]">
              See how a document becomes a demand
            </Link>
            <Link href="/" className="rounded-full border border-[#d1d5db] bg-white px-6 py-3 text-sm font-black text-[#111111] shadow-sm transition hover:border-[#2563eb] hover:text-[#2563eb]">
              Back to product
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-16 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
        <aside className="rounded-[2rem] border border-[#e5e7eb] bg-white p-7 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Why it differs</p>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.055em]">A workflow layer, not another file cabinet.</h2>
          <div className="mt-6 space-y-3">
            {proofPoints.map((point) => (
              <div key={point} className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4 text-sm font-bold text-[#111111]">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#2563eb]" />
                {point}
              </div>
            ))}
          </div>
        </aside>

        <div className="overflow-hidden rounded-[2rem] border border-[#e5e7eb] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
          <div className="overflow-x-auto">
            <table className="min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="bg-[#f8fafc]">
                  <th className="w-[24%] border-b border-[#e5e7eb] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#6b7280]">
                    Capability
                  </th>
                  <th className="w-[38%] border-b border-[#e5e7eb] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#6b7280]">
                    Generic document tools
                  </th>
                  <th className="w-[38%] border-b border-[#e5e7eb] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#2563eb]">
                    Onyx Intel
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.capability} className="border-b border-[#e5e7eb] last:border-b-0">
                    <td className="align-top px-5 py-5 text-sm font-black text-[#111111]">{row.capability}</td>
                    <td className="align-top px-5 py-5 text-sm leading-6 text-[#525252]">{row.generic}</td>
                    <td className="align-top px-5 py-5 text-sm leading-6 text-[#111111]">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#2563eb]" />
                      {row.onyx}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
        <div className="grid gap-8 rounded-[2rem] border border-[#e5e7eb] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)] lg:grid-cols-[1fr_0.8fr] lg:p-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Positioning</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
              Focused automation for legal document teams.
            </h2>
          </div>
          <p className="text-base leading-7 text-[#525252]">
            Onyx Intel is not trying to replace every practice-management system. It focuses on the operational
            path from incoming documents to organized case evidence, review-ready work product, and connected
            downstream systems.
          </p>
        </div>
      </section>

      <PublicMarketingFooter />
    </main>
  );
}
