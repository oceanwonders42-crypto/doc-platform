import DemoRequestForm from "./DemoRequestForm";
import PublicMarketingFooter from "../components/PublicMarketingFooter";
import PublicMarketingNav from "../components/PublicMarketingNav";

export const metadata = {
  title: "Book a Demo - Onyx Intel",
  description: "Request a focused walkthrough of Onyx Intel's legal document-to-demand automation workflow.",
};

const benefits = [
  "Connect firm email workflows and automatic PDF ingestion",
  "See how uploaded and emailed documents enter the same review pipeline",
  "Walk through AI routing confidence, chronology, missing records, and demand drafting",
  "Review Clio note writeback and developer-controlled firm access",
];

const trustNotes = [
  "No credit card",
  "15-minute walkthrough",
  "Tailored to your firm workflow",
  "Private by default",
];

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#f3f4f6] text-[#0a0a0a]">
      <PublicMarketingNav />

      <section className="relative overflow-hidden border-b border-[#e5e7eb]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_34%),linear-gradient(180deg,#f8fbff_0%,rgba(243,244,246,0)_78%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Book a Demo</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-[-0.07em] text-[#0a0a0a] sm:text-6xl">
              See how a document becomes a demand.
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#525252]">
              Request a walkthrough of Onyx Intel&apos;s focused legal document automation layer, from firm email
              PDF ingestion through review-ready demand output.
            </p>

            <div className="mt-8 grid gap-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 text-sm font-bold text-[#111111] shadow-sm">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#2563eb]" />
                  {benefit}
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {trustNotes.map((note) => (
                <span key={note} className="rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#6b7280]">
                  {note}
                </span>
              ))}
            </div>
          </div>

          <DemoRequestForm />
        </div>
      </section>

      <PublicMarketingFooter />
    </main>
  );
}
