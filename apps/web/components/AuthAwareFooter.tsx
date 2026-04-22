"use client";

import { usePathname } from "next/navigation";

export function AuthAwareFooter() {
  const pathname = usePathname() ?? "";
  if (pathname === "/" || pathname === "/login") return null;
  return (
    <footer
      className="onyx-header"
      style={{
        padding: "0.85rem var(--onyx-content-padding)",
        marginTop: "auto",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>
          Premium case operations for firms that need speed, traceability, and trust.
        </span>
        <a
          href="/dashboard/support/report"
          className="onyx-link"
          style={{ fontSize: "0.82rem", fontWeight: 600 }}
        >
          Report a problem
        </a>
      </div>
    </footer>
  );
}
