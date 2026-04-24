"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useDashboardAuth,
  canAccessBilling,
  canAccessTeam,
  isStaffOrAbove,
} from "@/contexts/DashboardAuthContext";

const IconFolder = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconFile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconEye = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconDownload = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </svg>
);

const IconArchive = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
    <path d="M10 12h4" />
  </svg>
);

const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconDollar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  teamOnly?: boolean;
  billingOnly?: boolean;
  staffOnly?: boolean;
  platformAdminOnly?: boolean;
};

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/dashboard/documents", label: "Documents", icon: <IconFile /> },
  { href: "/dashboard/review", label: "Review", icon: <IconEye />, staffOnly: true },
  { href: "/dashboard/cases", label: "Cases", icon: <IconFolder /> },
  { href: "/dashboard/exports", label: "Exports", icon: <IconDownload />, staffOnly: true },
];

const SECONDARY_ITEMS: NavItem[] = [
  { href: "/dashboard/records-requests", label: "Records Requests", icon: <IconClipboard /> },
  { href: "/dashboard/migration", label: "Migration", icon: <IconArchive />, staffOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: <IconSettings /> },
  { href: "/dashboard/team", label: "Team", icon: <IconUsers />, teamOnly: true },
  { href: "/dashboard/billing", label: "Billing", icon: <IconDollar />, billingOnly: true },
];

const ADMIN_ITEM: NavItem = {
  href: "/admin/quality",
  label: "Platform Admin",
  icon: <IconChart />,
  platformAdminOnly: true,
};

function renderSection(
  title: string,
  pathname: string,
  items: NavItem[]
) {
  return (
    <>
      <p
        style={{
          margin: "0 0 0.65rem",
          padding: "0 0.5rem",
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--onyx-sidebar-muted)",
        }}
      >
        {title}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`onyx-link ${isActive ? "active" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  padding: "0.7rem 0.8rem",
                  borderRadius: "calc(var(--onyx-radius-md) + 2px)",
                  fontSize: "0.92rem",
                  fontWeight: 500,
                  ...(isActive
                    ? {
                        background:
                          "linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(201, 162, 39, 0.18))",
                        color: "var(--onyx-sidebar-text)",
                        boxShadow: "inset 0 0 0 1px rgba(201, 162, 39, 0.18)",
                      }
                    : {}),
                }}
              >
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "1.95rem",
                    height: "1.95rem",
                    borderRadius: "0.8rem",
                    flexShrink: 0,
                    opacity: isActive ? 1 : 0.82,
                    background: isActive ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)",
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname() ?? "";
  const { role, isPlatformAdmin } = useDashboardAuth();

  const canShow = (item: NavItem) => {
    if (item.teamOnly && !canAccessTeam(role)) return false;
    if (item.billingOnly && !canAccessBilling(role)) return false;
    if (item.staffOnly && !isStaffOrAbove(role)) return false;
    if (item.platformAdminOnly && !isPlatformAdmin) return false;
    return true;
  };

  const primaryItems = PRIMARY_ITEMS.filter(canShow);
  const secondaryItems = SECONDARY_ITEMS.filter(canShow);
  const adminItems = isPlatformAdmin ? [ADMIN_ITEM] : [];

  return (
    <aside
      className="onyx-sidebar dashboard-sidebar-desktop"
      style={{
        width: "var(--onyx-sidebar-width)",
        flexShrink: 0,
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "1.35rem 1rem 1.2rem",
          borderBottom: "1px solid var(--onyx-sidebar-border)",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.75rem",
            textDecoration: "none",
            color: "var(--onyx-sidebar-text)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.9rem",
              background: "var(--onyx-gradient-hero)",
              color: "var(--onyx-surface)",
              fontSize: "0.85rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              boxShadow: "var(--onyx-shadow)",
            }}
          >
            OI
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            <span
              style={{
                fontFamily: "var(--onyx-font-display)",
                fontWeight: 700,
                fontSize: "1.05rem",
                letterSpacing: "-0.03em",
                color: "var(--onyx-sidebar-text)",
              }}
            >
              Onyx Intel
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "var(--onyx-sidebar-muted)",
              }}
            >
              Legal workflow operations
            </span>
          </span>
        </Link>
      </div>
      <nav style={{ flex: 1, padding: "0.95rem 0.65rem 0.75rem", overflowY: "auto" }}>
        {renderSection("Primary", pathname, primaryItems)}
        <div style={{ height: "1rem" }} />
        {renderSection("Secondary", pathname, secondaryItems)}
        {adminItems.length > 0 ? (
          <>
            <div style={{ height: "1rem" }} />
            {renderSection("Admin", pathname, adminItems)}
          </>
        ) : null}
      </nav>
      <div
        style={{
          padding: "0.95rem 1rem 1.1rem",
          borderTop: "1px solid var(--onyx-sidebar-border)",
        }}
      >
        <div
          style={{
            borderRadius: "var(--onyx-radius-lg)",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "0.9rem",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "#f3d57a",
            }}
          >
            Operator lane
          </p>
          <p
            style={{
              margin: "0.45rem 0 0",
              fontSize: "0.8rem",
              lineHeight: 1.55,
              color: "var(--onyx-sidebar-muted)",
            }}
          >
            Intake, review, case work, and exports stay visible in one honest workflow.
          </p>
        </div>
      </div>
    </aside>
  );
}
