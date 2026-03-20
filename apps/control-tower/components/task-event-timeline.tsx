import { formatDate } from "@/lib/utils";

type TaskEventTimelineProps = {
  items: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    source: string;
    createdAt: Date;
  }>;
};

export function TaskEventTimeline({ items }: TaskEventTimelineProps) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-ink">{item.title}</p>
            <span className="text-xs text-steel">{formatDate(item.createdAt)}</span>
          </div>
          <p className="mt-2 text-sm text-ink">{item.message}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-steel">
            <span className="rounded-full bg-slate-100 px-2 py-1 uppercase tracking-[0.16em]">{item.type}</span>
            <span className="rounded-full bg-slate-50 px-2 py-1 uppercase tracking-[0.16em]">{item.source}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
