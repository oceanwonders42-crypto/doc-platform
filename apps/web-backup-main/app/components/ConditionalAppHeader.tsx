"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationsBell from "../dashboard/NotificationsBell";

export default function ConditionalAppHeader() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <header
      style={{
        borderBottom: "1px solid #e5e5e5",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link
          href="/dashboard"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#111",
            textDecoration: "none",
          }}
        >
          Doc Platform
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/search"
            style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}
          >
            Search
          </Link>
          <Link
            href="/notifications"
            style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}
          >
            Notifications
          </Link>
          <NotificationsBell />
        </div>
      </div>
    </header>
  );
}
