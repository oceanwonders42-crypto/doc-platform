"use client";

/**
 * Case intelligence section: workflow-based metrics (timeline, billing, docs, sync) with real-looking values.
 * Supports the story: upload → process → review → sync.
 */
export default function CaseIntelligenceDashboard() {
  const metrics = [
    { label: "Treatment timeline", value: "5 visits", sub: "Extracted from 12 documents" },
    { label: "Billing totals", value: "$47,892", sub: "Itemized by provider" },
    { label: "Documents", value: "12", sub: "Organized by category" },
    { label: "Sync status", value: "Synced", sub: "Clio · 2 min ago" },
  ];

  return (
    <section id="case-intelligence" className="border-t border-[#2A2C2E] bg-[#121314] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[#FFFFFF] sm:text-4xl">
              Case intelligence dashboard
            </h2>
            <p className="mt-6 text-lg text-[#B3B6BA]">
              A single view for every case. See treatment timelines, billing totals, document counts, and sync status at a glance—without opening multiple systems.
            </p>
            <ul className="mt-8 space-y-4">
              {metrics.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-4 rounded-lg border border-[#2A2C2E] bg-[#181A1B] px-4 py-3">
                  <div>
                    <span className="text-sm text-[#B3B6BA]">{m.label}</span>
                    {m.sub && <p className="mt-0.5 text-xs text-[#B3B6BA]/80">{m.sub}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[#FFFFFF]">{m.value}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <span className="text-sm font-medium text-amber-400">1 review needed</span>
              <span className="text-xs text-amber-400/80">— PT_Progress_Notes flagged for date check</span>
            </div>
          </div>
          <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6 shadow-sm">
            <p className="text-center text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">
              Johnson v. Defendant · Case #2024-0847
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-[#2A2C2E] bg-[#121314] p-4 text-center">
                <p className="text-xs font-medium text-[#B3B6BA]">Timeline</p>
                <p className="mt-1 text-lg font-semibold text-[#FFFFFF]">5 visits</p>
              </div>
              <div className="rounded-lg border border-[#2A2C2E] bg-[#121314] p-4 text-center">
                <p className="text-xs font-medium text-[#B3B6BA]">Billing</p>
                <p className="mt-1 text-lg font-semibold text-[#14B8A6]">$47,892</p>
              </div>
              <div className="rounded-lg border border-[#2A2C2E] bg-[#121314] p-4 text-center">
                <p className="text-xs font-medium text-[#B3B6BA]">Docs</p>
                <p className="mt-1 text-lg font-semibold text-[#FFFFFF]">12</p>
              </div>
              <div className="rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/10 p-4 text-center">
                <p className="text-xs font-medium text-[#B3B6BA]">Sync</p>
                <p className="mt-1 text-sm font-semibold text-[#3B82F6]">Synced 2m ago</p>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-[#B3B6BA]">
              Real-time metrics from processed documents
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
