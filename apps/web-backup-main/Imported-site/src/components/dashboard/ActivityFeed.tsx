"use client";

export type ActivityItem = {
  id: string;
  action: string;
  detail: string;
  at: string;
  /** true = success, false = failed, null = in progress / processing */
  success: boolean | null;
};

type ActivityFeedProps = {
  items: ActivityItem[];
  loading?: boolean;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ActivityFeed({ items, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Recent activity</p>
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[#121314]" />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Recent activity</p>
        <p className="mt-4 text-sm text-[#B3B6BA]">No recent activity. Sync and processing events will appear here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] overflow-hidden">
      <div className="border-b border-[#2A2C2E] px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Recent activity</p>
      </div>
      <ul className="divide-y divide-[#2A2C2E] max-h-80 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3 hover:bg-[#121314]/50 transition-colors flex gap-3">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                item.success === true ? "bg-[#14B8A6]" : item.success === false ? "bg-amber-500" : "bg-[#3B82F6] animate-pulse"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#FFFFFF]">{item.action}</p>
              <p className="mt-0.5 text-xs text-[#B3B6BA]">{item.detail}</p>
            </div>
            <span className="shrink-0 text-xs text-[#B3B6BA]">{formatTime(item.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
