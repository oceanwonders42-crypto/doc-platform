import { cn } from "@/lib/utils";

type PanelProps = {
  children: React.ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  return (
    <section className={cn("rounded-3xl border border-slate-200 bg-white shadow-panel", className)}>
      {children}
    </section>
  );
}
