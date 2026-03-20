import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-2 text-sm text-ink">
      <span className="font-medium">{label}</span>
      {children}
      {description ? <span className="text-xs text-steel">{description}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400",
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-0 transition focus:border-slate-400",
        props.className,
      )}
    />
  );
}
