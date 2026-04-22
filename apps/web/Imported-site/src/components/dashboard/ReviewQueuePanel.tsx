"use client";

export type ReviewQueueItem = {
  id: string;
  documentName: string;
  caseLabel: string;
  reason: string;
  priority: "high" | "medium" | "low";
};

type ReviewQueuePanelProps = {
  items: ReviewQueueItem[];
  loading?: boolean;
};

export default function ReviewQueuePanel({ items, loading }: ReviewQueuePanelProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Review needed</p>
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[#121314]" />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Review needed</p>
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-[#2A2C2E] py-8">
          <p className="text-sm font-medium text-[#FFFFFF]">All caught up</p>
          <p className="mt-1 text-xs text-[#B3B6BA]">No documents waiting for review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] overflow-hidden">
      <div className="border-b border-[#2A2C2E] px-4 py-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Review needed</p>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
          {items.length} pending
        </span>
      </div>
      <ul className="divide-y divide-[#2A2C2E]">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3 hover:bg-[#121314]/50 transition-colors">
            <p className="text-sm font-medium text-[#FFFFFF] truncate" title={item.documentName}>
              {item.documentName}
            </p>
            <p className="mt-0.5 text-xs text-[#B3B6BA]">{item.caseLabel}</p>
            <p className="mt-1 text-xs text-amber-400/90">{item.reason}</p>
            <span
              className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                item.priority === "high" ? "bg-red-500/20 text-red-400" : "bg-[#2A2C2E] text-[#B3B6BA]"
              }`}
            >
              {item.priority}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
