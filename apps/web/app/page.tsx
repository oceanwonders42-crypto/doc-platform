import Link from "next/link";
import PublicMarketingFooter from "./components/PublicMarketingFooter";
import PublicMarketingNav from "./components/PublicMarketingNav";

export const metadata = {
  title: "Onyx Intel - Legal document automation",
  description:
    "Onyx Intel turns firm email workflows, PDFs, medical records, bills, and case files into organized cases, chronologies, records requests, and review-ready demands.",
};

const pipelineSteps = [
  ["01", "Connect", "Connect firm email inboxes and ingest PDFs automatically, starting with Gmail OAuth support."],
  ["02", "Read", "OCR and classification pull structured signals from uploads, email attachments, and case documents."],
  ["03", "Route", "AI routing explains confidence, source fields, and why a document belongs in a case or review queue."],
  ["04", "Build", "Chronologies, missing records, bills vs treatment, records requests, and demands move together."],
  ["05", "Write back", "Review-ready outputs and Clio notes stay human-controlled before anything leaves the firm."],
];

const roleCards = [
  {
    title: "Firm admins",
    body: "Firm health, usage, team activity, integrations, feature access, and blocked work in one calm overview.",
  },
  {
    title: "Attorneys",
    body: "Case context, chronology, missing records, bills versus treatment, and demand drafts stay review-ready.",
  },
  {
    title: "Assistants and paralegals",
    body: "Assigned cases, review queues, records requests, demand tasks, provider lookup, and case-aware AI support.",
  },
];

const workflows = [
  "Firm email PDF ingestion",
  "Document review and OCR",
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
    title: "Firm-scoped by default",
    body: "Documents, cases, AI answers, and integration data stay scoped to authorized firm users.",
  },
  {
    title: "Human review stays in control",
    body: "Low-confidence routing and demand drafts are surfaced for review. Legal work product is not auto-sent.",
  },
  {
    title: "Traceable decisions",
    body: "Routing reasons, confidence, preview access, records requests, and writeback steps are built to be auditable.",
  },
];

const inboxRows = [
  { name: "ER report - Jordan Alvarez.pdf", tag: "Medical record", status: "Routed" },
  { name: "MRI lumbar findings.pdf", tag: "Imaging", status: "Case match" },
  { name: "Billing ledger.pdf", tag: "Billing", status: "Review" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">{children}</p>;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f3f4f6] text-[#0a0a0a]">
      <PublicMarketingNav />

      <section className="relative overflow-hidden border-b border-[#e5e7eb]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_28%_15%,rgba(59,130,246,0.16),transparent_34%),linear-gradient(180deg,#f8fbff_0%,rgba(243,244,246,0)_78%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-28">
          <div className="flex flex-col justify-center">
            <SectionLabel>Legal document automation</SectionLabel>
            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.075em] text-[#0a0a0a] sm:text-6xl lg:text-7xl">
              All legal documents. One intelligent workflow.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#525252]">
              Onyx Intel turns emails, PDFs, medical records, bills, and case files into organized cases,
              chronologies, records requests, and review-ready demands.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#6b7280]">
              Email, upload, and case documents all feed the same review pipeline, with firm-controlled AI
              routing and human review before legal output is finalized.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-full bg-[#0a0a0a] px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#2563eb]"
              >
                Book a Demo
              </Link>
              <Link
                href="/compare"
                className="rounded-full border border-[#d1d5db] bg-white px-6 py-3 text-sm font-black text-[#111111] shadow-sm transition hover:border-[#2563eb] hover:text-[#2563eb]"
              >
                Compare tools
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -right-6 top-8 hidden h-28 w-28 rounded-full border border-[#bfdbfe] bg-[#eff6ff] lg:block" />
            <div className="relative rounded-[2rem] border border-[#e5e7eb] bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.14)]">
              <div className="rounded-[1.5rem] border border-[#e5e7eb] bg-[#f8fafc] p-4">
                <div className="flex items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6b7280]">Document inbox</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Today&apos;s legal intake</h2>
                  </div>
                  <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-black text-[#1d4ed8]">
                    Reviewable
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {inboxRows.map((row) => (
                    <div key={row.name} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
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
                      Demand draft
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#525252]">
                      Chronology, bills, missing records, and template controls stay visible before export.
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 left-6 right-6 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6b7280]">Floating AI assistant</p>
                <p className="mt-1 text-sm font-semibold text-[#111111]">
                  Ask: What records are missing before this demand is reviewed?
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflows" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="rounded-[2rem] border border-[#e5e7eb] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)] lg:p-10">
          <div className="max-w-3xl">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a] sm:text-5xl">
              A single source of truth from inbound PDF to attorney review.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-5">
            {pipelineSteps.map(([number, title, body]) => (
              <div key={title} className="rounded-3xl border border-[#e5e7eb] bg-[#f8fafc] p-5">
                <span className="text-xs font-black text-[#2563eb]">{number}</span>
                <h3 className="mt-3 text-base font-black tracking-[-0.03em] text-[#111111]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#525252]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-[#e5e7eb] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
            <SectionLabel>Built for legal teams</SectionLabel>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
              Less tab-hopping. More case progress.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#525252]">
              Onyx Intel is a focused legal document-to-demand automation layer. It does not try to replace every
              system. It makes the document lane faster, cleaner, and easier to trust.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {roleCards.map((card) => (
              <article key={card.title} className="rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-[0_14px_35px_rgba(15,23,42,0.07)]">
                <h3 className="text-lg font-black tracking-[-0.035em]">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#525252]">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="rounded-[2rem] border border-[#e5e7eb] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)] lg:p-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <SectionLabel>Core workflows</SectionLabel>
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
              <div key={workflow} className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                <span className="text-sm font-bold text-[#111111]">{workflow}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="rounded-[2rem] border border-[#e5e7eb] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)] lg:p-10">
          <div className="max-w-3xl">
            <SectionLabel>Trust and control</SectionLabel>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
              Firm-controlled AI workflows, not black-box automation.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {trustCards.map((card) => (
              <article key={card.title} className="rounded-3xl border border-[#e5e7eb] bg-[#f8fafc] p-6">
                <div className="mb-5 h-1 w-12 rounded-full bg-[#2563eb]" />
                <h3 className="text-lg font-black tracking-[-0.035em]">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#525252]">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto grid max-w-7xl gap-6 px-5 pb-20 lg:grid-cols-[1fr_0.8fr] lg:px-8">
        <div className="rounded-[2rem] border border-[#e5e7eb] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <SectionLabel>Resources/About</SectionLabel>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#0a0a0a]">
            Designed as a focused automation layer for legal document teams.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#525252]">
            Established legal platforms often emphasize broad practice management. Onyx Intel focuses on the
            document-to-demand lane: firm email PDFs, AI routing, chronology, records requests, demand drafts,
            and Clio writeback with developer-controlled firm access.
          </p>
        </div>
        <div className="rounded-[2rem] border border-[#e5e7eb] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <SectionLabel>Walkthrough</SectionLabel>
          <h3 className="mt-4 text-3xl font-black tracking-[-0.055em]">See how a document becomes a demand.</h3>
          <p className="mt-3 text-sm leading-6 text-[#525252]">
            Walk through ingestion, routing confidence, case context, chronology, and a review-ready demand draft.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/demo" className="rounded-full bg-[#0a0a0a] px-5 py-3 text-sm font-black text-white transition hover:bg-[#2563eb]">
              Book a Demo
            </Link>
            <Link href="/login" className="rounded-full border border-[#d1d5db] bg-white px-5 py-3 text-sm font-black text-[#111111]">
              Login
            </Link>
          </div>
        </div>
      </section>

      <PublicMarketingFooter />
    </main>
  );
}
