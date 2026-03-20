"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ListTodo, Settings2, Split, Telescope } from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: Telescope },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/decisions", label: "Decisions", icon: Split },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex min-h-screen max-w-[1560px] gap-6 px-6 py-6">
        <aside className="hidden w-64 shrink-0 rounded-[28px] bg-ink px-5 py-6 text-white shadow-panel lg:block">
          <div className="border-b border-white/10 pb-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Internal Ops</p>
            <h1 className="mt-3 text-2xl font-semibold">Onyx Control Tower</h1>
            <p className="mt-2 text-sm text-slate-300">
              One operator dashboard for projects, agents, blockers, and deploy context.
            </p>
          </div>
          <nav className="mt-6 grid gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
                    active ? "bg-white text-ink" : "text-slate-200 hover:bg-white/10",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <p className="font-medium text-white">Auth Stubbed For MVP</p>
            <p className="mt-2 text-slate-300">
              Next step: add GitHub SSO, a reverse-proxy gate, or a simple team password.
            </p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-panel">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-steel">Operator Workspace</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Keep the work moving.</h2>
              </div>
              <div className="grid gap-2 text-sm text-steel sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="font-medium text-ink">Source of truth</p>
                  <p>GitHub issues, PRs, branches</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="font-medium text-ink">Execution layer</p>
                  <p>Codex, Cursor, Claude, and you</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="font-medium text-ink">Deploy shape</p>
                  <p>Docker-first, DigitalOcean-ready</p>
                </div>
              </div>
            </div>
          </header>
          <main className="pb-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
