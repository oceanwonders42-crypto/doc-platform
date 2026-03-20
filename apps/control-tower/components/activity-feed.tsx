import Link from "next/link";

import { formatDate } from "@/lib/utils";

type ActivityFeedProps = {
  items: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: Date;
    project?: { slug: string; name: string } | null;
    task?: { id: string; title: string } | null;
  }>;
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{item.message}</p>
            <span className="text-xs text-steel">{formatDate(item.createdAt)}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-steel">
            <span className="rounded-full bg-slate-100 px-2 py-1 uppercase tracking-[0.16em]">
              {item.type}
            </span>
            {item.project ? (
              <Link href={`/projects/${item.project.slug}`} className="text-signal hover:underline">
                {item.project.name}
              </Link>
            ) : null}
            {item.task ? <span>{item.task.title}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
