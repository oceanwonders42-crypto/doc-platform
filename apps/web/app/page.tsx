import Link from "next/link";
import PublicMarketingNav from "./components/PublicMarketingNav";

export const metadata = {
  title: "Onyx Intel - Legal document automation",
  description:
    "Onyx Intel turns emails, PDFs, medical records, bills, and case files into organized cases, chronologies, records requests, and review-ready demands.",
};

const pipelineSteps = [
  "Email/PDF",
  "OCR",
  "AI routing",
  "Case",
  "Chronology",
  "Demand",
  "Clio",
];

const roleCards = [
  {
    title: "Firm admins",
    body: "See firm health, usage, team activity, integrations, feature access, and blocked items that need attention.",
  },
  {
    title: "Attorneys",
    body: "Review case context, chronology, missing records, bills versus treatment, and demand drafts before anything goes out.",
  },
  {
    title: "Assistants and paralegals",
    body: "Work from assigned cases, review queues, records requests, demand tasks, provider lookup, and case-aware AI support.",
  },
];

const workflows = [
  "Email PDF ingestion",
  "Document review",
  "AI case routing",
  "Chronology generation",
  "Missing records",
  "Bills vs treatment",
  "Records requests",
  "Demand drafting",
  "Clio note writeback",
];

const trustCards = [
  {
    title: "Firm-scoped access",
    body: "Documents, cases, AI answers, and integration data stay scoped to the active firm and authorized users.",
  },
  {
    title: "Human review",
    body: "Uncertain routing decisions and demand drafts stay review-ready. Onyx Intel does not auto-send legal work product.",
  },
  {
    title: "Audit trail",
    body: "Routing reasons, confidence, records requests, document previews, and writeback steps are designed to be traceable.",
  },
];

const inboxRows = [
  { name: "ER report - Jordan Alvarez.pdf", tag: "Medical", status: "Routed" },
  { name: "MRI lumbar findings.pdf", tag: "Imaging", status: "Case match" },
  { name: "Billing ledger.pdf", tag: "Billing", status: "Review" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <PublicMarketingNav />

      <section className="relative overflow-hidden border-b border-[#e5e7eb]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_30%_20%,rgba(37,99,235,0.12),transparent_32%),linear-gradient(180deg,#eff6ff_0%,rgba(255,255,255,0)_72%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-28">
          <div className="flex flex-col justify-center">
            <p className="mb-5 text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">
              Legal document automation
            </p>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.075em] text-[#0a0a0a] sm:text-6xl lg:text-7xl">
              All legal documents. One intelligent workflow.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#525252]">
              Onyx Intel turns emails, PDFs, medical records, bills, and case files into organized cases,
              chronologies, records requests, and review-ready demands.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/support/report"
                className="rounded-full bg-[#0a0a0a] px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#2563eb]"
              >
                Book a Demo
              </Link>
              <Link
                href="/compare"
                className="rounded-full border border-[#d1d5db] bg-white px-6 py-3 text-sm font-black text-[#111111] transition hover:border-[#2563eb] hover:text-[#2563eb]"
              >
                See the comparison
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -right-8 top-8 hidden h-32 w-32 rounded-full border border-[#bfdbfe] bg-[#eff6ff] lg:block" />
            <div className="relative rounded-[2rem] border border-[#e5e7eb] bg-white p-4 shadow-[0_28px_80px_rgba(15,23,42,0.10)]">
              <div className="rounded-[1.5rem] border border-[#e5e7eb] bg-[#fafafa] p-4">
                <div className="flex items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6b7280]">Document inbox</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Today&apos;s legal intake</h2>
                  </div>
                  <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-black text-[#1d4ed8]">
                    Live routing
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {inboxRows.map((row) => (
                    <div key={row.name} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-[#111111]">{row.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[#6b7280]">{row.tag}</p>
                        </div>
                        <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1 text-xs font-bold text-[#2563eb]">
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb]">AI routing decision</p>
                    <p className="mt-2 text-sm font-bold text-[#111111]">Matched to Jordan Alvarez QA Collision</p>
                    <p className="mt-1 text-sm leading-6 text-[#525252]">
                      Confidence 87%. Client name, provider, and treatment date overlap the case timeline.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6b7280]">
                      Review-ready demand
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#525252]">
                      Chronology, bills, missing records, and template controls stay visible before export.
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 left-6 right-6 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6b7280]">AI assistant</p>
                <p className="mt-1 text-sm font-semibold text-[#111111]">
                  Ask: What records are missing before this demand is reviewed?
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflows" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">How it works</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a] sm:text-5xl">
            From inbound PDF to attorney review, every step stays traceable.
          </h2>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-7">
          {pipelineSteps.map((step, index) => (
            <div key={step} className="rounded-3xl border border-[#e5e7eb] bg-[#f8fafc] p-5">
              <span className="text-xs font-black text-[#2563eb]">0{index + 1}</span>
              <p className="mt-3 text-sm font-black text-[#111111]">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="product" className="border-y border-[#e5e7eb] bg-[#fafafa]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Built for legal teams</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
              Less tab-hopping. More case progress.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#525252]">
              Onyx Intel is a focused document-to-demand automation layer for firms that need intake,
              review, drafting, and writeback to feel like one workflow.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {roleCards.map((card) => (
              <article key={card.title} className="rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black tracking-[-0.035em]">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#525252]">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Core workflows</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
              The legal operations layer between documents and demands.
            </h2>
          </div>
          <Link href="/compare" className="text-sm font-black text-[#2563eb] hover:underline">
            Compare Onyx Intel
          </Link>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <div key={workflow} className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
              <span className="text-sm font-bold text-[#111111]">{workflow}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="security" className="border-y border-[#e5e7eb] bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Trust and control</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
              Firm-controlled AI workflows, not black-box automation.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {trustCards.map((card) => (
              <article key={card.title} className="rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black tracking-[-0.035em]">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#525252]">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 lg:grid-cols-[1fr_0.8fr] lg:px-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Resources/About</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
            Designed as a focused automation layer for legal document teams.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#525252]">
            Established legal platforms often emphasize broad practice management. Onyx Intel is focused on
            the document-to-demand lane: email PDFs, AI routing, chronology, records requests, demand drafts,
            and Clio writeback with developer-controlled firm access.
          </p>
        </div>
        <div className="rounded-[2rem] border border-[#e5e7eb] bg-[#fafafa] p-8">
          <h3 className="text-2xl font-black tracking-[-0.04em]">See how a document becomes a demand.</h3>
          <p className="mt-3 text-sm leading-6 text-[#525252]">
            Walk through ingestion, routing confidence, case context, chronology, and a review-ready demand draft.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/support/report" className="rounded-full bg-[#0a0a0a] px-5 py-3 text-sm font-black text-white">
              Book a Demo
            </Link>
            <Link href="/login" className="rounded-full border border-[#d1d5db] bg-white px-5 py-3 text-sm font-black text-[#111111]">
              Login
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
