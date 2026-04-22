"use client";

/**
 * Marketing dashboard preview: premium product showcase.
 */
export default function DashboardPreview() {
  const timelineEntries = [
    { date: "03/15/24", event: "ER Visit", provider: "City General Hospital" },
    { date: "03/18/24", event: "PCP Initial", provider: "Dr. Smith, Family Med" },
    { date: "03/20/24", event: "Imaging", provider: "Radiology Associates" },
    { date: "03/22/24", event: "PT Eval", provider: "PT Associates" },
    { date: "03/25/24", event: "PCP Follow-up", provider: "Dr. Smith" },
  ];
  const providers = [
    { name: "City General Hospital", type: "Emergency" },
    { name: "Dr. Smith, Family Med", type: "Primary Care" },
    { name: "Radiology Associates", type: "Imaging" },
    { name: "PT Associates", type: "Physical Therapy" },
  ];
  const billingBreakdown = [
    { label: "Hospital", amount: "$18,420" },
    { label: "Physician", amount: "$12,350" },
    { label: "Imaging", amount: "$8,922" },
    { label: "PT", amount: "$8,200" },
  ];
  const totalBilling = 47892;
  const docCategories = [
    { name: "ER Records", count: 23 },
    { name: "Imaging", count: 12 },
    { name: "Bills", count: 8 },
    { name: "PCP Notes", count: 15 },
    { name: "Other", count: 8 },
  ];
  const reviewNeeded = [
    { doc: "PT_Progress_Notes_03-22.pdf", reason: "Timeline date mismatch" },
  ];
  const recentActivity = [
    { action: "Billing extracted", detail: "Hospital_Statement_0324.pdf — $18,420", success: true },
    { action: "Sync completed", detail: "Johnson v. Defendant → Clio matter #0847", success: true },
    { action: "Review flagged", detail: "PT_Progress_Notes_03-22.pdf — date mismatch", success: false },
  ];

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[var(--border-refined)] hover:shadow-[var(--shadow-card-hover)]">
      <div className="mb-5 flex items-center justify-between border-b border-[var(--border-default)] pb-4">
        <div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Case #2024-0847</span>
          <span className="ml-3 text-xs text-[var(--text-secondary)]">Johnson v. Defendant</span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent-blue)]/15 px-3 py-1.5 text-xs font-medium text-[var(--accent-blue)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-blue)]" />
          Synced to Clio
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-section)]/80 p-4 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Treatment timeline
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Built from extracted dates and providers</p>
          <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto">
            {timelineEntries.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 font-mono text-xs text-[var(--accent-blue)]">{e.date}</span>
                <span className="text-[var(--text-primary)]">{e.event}</span>
                <span className="truncate text-[var(--text-secondary)]">— {e.provider}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--accent-teal)]/30 bg-[var(--accent-teal)]/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Billing extracted
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--accent-teal)]">
            ${totalBilling.toLocaleString("en-US")}
          </p>
          <div className="mt-2 space-y-1">
            {billingBreakdown.map((b, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{b.label}</span>
                <span className="font-medium text-[var(--accent-teal)]">{b.amount}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-section)]/80 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Providers extracted
          </p>
          <div className="mt-2 space-y-2">
            {providers.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-[var(--text-primary)]">{p.name}</span>
                <span className="shrink-0 rounded bg-[var(--accent-teal)]/20 px-1.5 py-0.5 text-xs text-[var(--accent-teal)]">
                  {p.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-section)]/80 p-4 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Document categories
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Processed and categorized by type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {docCategories.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2"
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">{c.name}</span>
                <span className="rounded-full bg-[var(--accent-blue)]/20 px-2 py-0.5 text-xs font-medium text-[var(--accent-blue)]">
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              Sync status
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--accent-blue)]">Synced</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Last sync: 2 min ago</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Next: Auto in 5 min</p>
          </div>
          {reviewNeeded.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                Review needed
              </p>
              <p className="mt-1 text-xs font-medium text-amber-400">{reviewNeeded[0].doc}</p>
              <p className="mt-0.5 text-xs text-amber-400/90">{reviewNeeded[0].reason}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-section)]/80 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          Recent activity
        </p>
        <div className="mt-2 space-y-1.5">
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.success ? "bg-[var(--accent-teal)]" : "bg-amber-500"}`}
              />
              <span className="text-[var(--text-primary)]">{a.action}</span>
              <span className="text-[var(--text-secondary)]">· {a.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--text-secondary)]">
        Upload → process → review → sync · Case Intelligence Dashboard
      </p>
    </div>
  );
}
