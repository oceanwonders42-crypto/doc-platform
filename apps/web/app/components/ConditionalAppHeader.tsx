"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ConditionalAppHeader() {
  const pathname = usePathname() ?? "";
  if (
    pathname === "/" ||
    pathname === "/compare" ||
    pathname === "/security" ||
    pathname === "/login" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  return (
    <header
      className="onyx-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        padding: "0.85rem var(--onyx-content-padding)",
        minHeight: "68px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "1rem",
            fontWeight: 700,
            color: "var(--onyx-text)",
            textDecoration: "none",
            letterSpacing: "-0.03em",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "2.25rem",
              height: "2.25rem",
              padding: "0 0.55rem",
              borderRadius: "999px",
              background: "var(--onyx-gradient-hero)",
              color: "var(--onyx-surface)",
              fontSize: "0.85rem",
              boxShadow: "var(--onyx-shadow)",
            }}
          >
            OI
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            <span style={{ fontFamily: "var(--onyx-font-display)" }}>Onyx Intel</span>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--onyx-text-muted)",
              }}
            >
              Legal document intelligence
            </span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span className="onyx-badge onyx-badge-info">Secure workspace</span>
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
