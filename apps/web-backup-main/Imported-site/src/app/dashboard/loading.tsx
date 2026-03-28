export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] pt-16 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
        <p className="text-sm text-[#B3B6BA]">Loading dashboard…</p>
      </div>
    </div>
  );
}
