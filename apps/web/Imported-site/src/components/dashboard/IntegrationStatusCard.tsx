"use client";

export type IntegrationStatus = {
  provider: string;
  connected: boolean;
  /** synced | syncing | failed — for realistic sync status UI */
  syncStatus?: "synced" | "syncing" | "failed";
  lastSyncAt: string;
  nextSyncIn: string;
  mattersSynced: number;
};

type IntegrationStatusCardProps = {
  status: IntegrationStatus;
  loading?: boolean;
};

function formatRelativeTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function IntegrationStatusCard({ status, loading }: IntegrationStatusCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6 animate-pulse">
        <div className="h-4 w-24 bg-[#121314] rounded" />
        <div className="mt-4 h-6 w-32 bg-[#121314] rounded" />
        <div className="mt-2 h-3 w-40 bg-[#121314] rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Integration</p>
        {status.connected ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#3B82F6]/20 px-2.5 py-1 text-xs font-medium text-[#3B82F6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6] animate-pulse" />
            Connected
          </span>
        ) : (
          <span className="rounded-full bg-[#2A2C2E] px-2.5 py-1 text-xs text-[#B3B6BA]">Disconnected</span>
        )}
      </div>
      <p className="mt-3 text-lg font-semibold text-[#FFFFFF]">{status.provider}</p>
      {status.syncStatus === "syncing" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#3B82F6]/10 px-3 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#3B82F6]" />
          <span className="text-sm text-[#3B82F6]">Syncing…</span>
        </div>
      )}
      {status.syncStatus === "failed" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-sm text-red-400">Last sync failed</span>
        </div>
      )}
      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-[#B3B6BA]">Last sync</dt>
          <dd className="text-[#FFFFFF]">{formatRelativeTime(status.lastSyncAt)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#B3B6BA]">Next sync</dt>
          <dd className="text-[#FFFFFF]">{status.nextSyncIn}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#B3B6BA]">Matters synced</dt>
          <dd className="text-[#FFFFFF]">{status.mattersSynced}</dd>
        </div>
      </dl>
    </div>
  );
}
