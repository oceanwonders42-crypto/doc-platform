"use client";

export type TimelineEntry = {
  date: string;
  event: string;
  provider: string;
};

type TreatmentTimelinePreviewProps = {
  entries: TimelineEntry[];
  caseLabel?: string;
  loading?: boolean;
};

export default function TreatmentTimelinePreview({ entries, caseLabel = "Johnson v. Defendant", loading }: TreatmentTimelinePreviewProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Treatment timeline</p>
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-[#121314]" />
          ))}
        </div>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Treatment timeline</p>
        <p className="mt-4 text-sm text-[#B3B6BA]">No timeline data for this case yet. Process records to build the timeline.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Treatment timeline</p>
      <p className="mt-1 text-sm text-[#B3B6BA]">{caseLabel}</p>
      <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
        {entries.map((e, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className="shrink-0 font-mono text-xs text-[#3B82F6]">{e.date}</span>
            <div className="min-w-0">
              <span className="font-medium text-[#FFFFFF]">{e.event}</span>
              <span className="ml-1.5 text-[#B3B6BA]">— {e.provider}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
