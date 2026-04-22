"use client";

export type RecentDocument = {
  id: string;
  name: string;
  case: string;
  status: string;
  date: string;
  category: string;
};

type RecentDocumentsTableProps = {
  documents: RecentDocument[];
  loading?: boolean;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes("processing")) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-[#3B82F6]/20 px-2 py-0.5 text-xs font-medium text-[#3B82F6]">
        <span className="h-1 w-1 animate-pulse rounded-full bg-[#3B82F6]" />
        {status}
      </span>
    );
  }
  if (s.includes("review") || s.includes("needs review")) {
    return (
      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
        {status}
      </span>
    );
  }
  if (s.includes("failed")) {
    return (
      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
        {status}
      </span>
    );
  }
  if (s.includes("synced") || s.includes("processed") || s.includes("ready")) {
    return (
      <span className="rounded-full bg-[#14B8A6]/20 px-2 py-0.5 text-xs font-medium text-[#14B8A6]">
        {status}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#2A2C2E] px-2 py-0.5 text-xs font-medium text-[#B3B6BA]">
      {status}
    </span>
  );
}

export default function RecentDocumentsTable({ documents, loading }: RecentDocumentsTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Recent documents</p>
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[#121314]" />
          ))}
        </div>
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Recent documents</p>
        <p className="mt-4 text-sm text-[#B3B6BA]">No documents processed yet. Upload records to see activity here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] overflow-hidden">
      <div className="border-b border-[#2A2C2E] px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">Recent documents</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2A2C2E] text-left text-[#B3B6BA]">
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Case</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Processed</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b border-[#2A2C2E]/50 last:border-0 hover:bg-[#121314]/50">
                <td className="px-4 py-3 font-medium text-[#FFFFFF] truncate max-w-[200px]" title={doc.name}>
                  {doc.name}
                </td>
                <td className="px-4 py-3 text-[#B3B6BA]">{doc.case}</td>
                <td className="px-4 py-3 text-[#B3B6BA]">{doc.category}</td>
                <td className="px-4 py-3">{statusBadge(doc.status)}</td>
                <td className="px-4 py-3 text-right text-[#B3B6BA]">{formatDate(doc.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
