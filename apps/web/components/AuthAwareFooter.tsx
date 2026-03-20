"use client";

import { usePathname } from "next/navigation";

export function AuthAwareFooter() {
  const pathname = usePathname() ?? "";
  if (pathname === "/" || pathname === "/login") return null;
  return (
    <footer
      style={{
        padding: "0.5rem 1rem",
        fontSize: "0.75rem",
        color: "var(--onyx-text-muted)",
        borderTop: "1px solid var(--onyx-border-subtle)",
        marginTop: "auto",
        background: "var(--onyx-bg)",
        flexShrink: 0,
      }}
    >
      <a href="/dashboard/support/report" style={{ color: "var(--onyx-accent)" }}>Report a problem</a>
    </footer>
  );
}
