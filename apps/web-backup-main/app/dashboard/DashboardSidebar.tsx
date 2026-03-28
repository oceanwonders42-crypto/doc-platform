"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

type NavSection = {
  title: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/cases", label: "Cases" },
      { href: "/providers", label: "Providers" },
      { href: "/records-requests", label: "Records Requests" },
    ],
  },
  {
    title: "Review",
    items: [
      { href: "/dashboard/review", label: "Review queue" },
      { href: "/dashboard/overdue-tasks", label: "Overdue tasks" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/dashboard/metrics", label: "Metrics" },
      { href: "/dashboard/analytics", label: "Analytics" },
      { href: "/dashboard/usage", label: "Usage" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/dashboard/settings/routing", label: "Routing rules" },
      { href: "/dashboard/settings/crm", label: "CRM" },
      { href: "/dashboard/providers/map", label: "Provider map" },
      { href: "/dashboard/email", label: "Email intake" },
    ],
  },
  {
    title: "Other",
    items: [
      { href: "/exports", label: "Clio Export" },
      { href: "/billing", label: "Billing" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="dashboard-sidebar"
      aria-label="Dashboard navigation"
      style={{
        width: 220,
        flexShrink: 0,
        padding: "20px 0",
        borderRight: "1px solid #e5e5e5",
        background: "#fafafa",
      }}
    >
      <div style={{ padding: "0 16px" }}>
        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                color: "#888",
                textTransform: "uppercase",
                marginBottom: 10,
                paddingLeft: 12,
              }}
            >
              {section.title}
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href} style={{ marginBottom: 2 }}>
                    <Link
                      href={item.href}
                      style={{
                        display: "block",
                        padding: "8px 12px",
                        fontSize: 14,
                        fontWeight: active ? 600 : 500,
                        color: active ? "#111" : "#444",
                        textDecoration: "none",
                        borderRadius: 8,
                        background: active ? "#fff" : "transparent",
                        borderLeft: active ? "3px solid #111" : "3px solid transparent",
                        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
