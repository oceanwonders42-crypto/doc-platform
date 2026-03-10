"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ConditionalAppHeader() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <header
      style={{
        borderBottom: "1px solid var(--onyx-border-subtle)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--onyx-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link
          href="/dashboard"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--onyx-text)",
            textDecoration: "none",
          }}
        >
          Onyx Intel
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/dashboard"
            style={{ fontSize: 14, color: "var(--onyx-text-secondary)", textDecoration: "underline" }}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
