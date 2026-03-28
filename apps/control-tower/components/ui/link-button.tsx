import Link from "next/link";

import { cn } from "@/lib/utils";

type LinkButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

const variants = {
  primary: "bg-ink text-white hover:bg-slate-800",
  secondary: "bg-slate-100 text-ink hover:bg-slate-200",
};

export function LinkButton({
  href,
  children,
  variant = "secondary",
  className,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium transition",
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
