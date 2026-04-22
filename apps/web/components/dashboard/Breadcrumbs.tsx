"use client";

import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "var(--onyx-dash-font-sm)",
        color: "var(--onyx-text-muted)",
      }}
      aria-label="Breadcrumb"
    >
      <Link href="/dashboard" className="onyx-link" style={{ transition: "color 0.15s ease" }}>
        Dashboard
      </Link>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ color: "var(--onyx-text-muted-soft)", userSelect: "none" }}>/</span>
          {item.href ? (
            <Link href={item.href} className="onyx-link">
              {item.label}
            </Link>
          ) : (
            <span style={{ color: "var(--onyx-text-secondary)" }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
