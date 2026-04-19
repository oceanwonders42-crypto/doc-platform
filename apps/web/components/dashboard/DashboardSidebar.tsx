"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import {
  useDashboardAuth,
  canAccessTeam,
  canAccessBilling,
  canAccessFirmSettings,
  canAccessIntegrations,
  canAccessAuditQuality,
  isStaffOrAbove,
} from "@/contexts/DashboardAuthContext";

/* Minimal 20×20 outline icons – stroke 1.5, viewBox 0 0 24 24 */
const IconDashboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
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
const IconBuilding = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 21h18" />
    <path d="M5 21V7l8-4v18" />
    <path d="M19 21V11l-6-4" />
    <path d="M9 9v.01" />
    <path d="M9 12v.01" />
    <path d="M9 15v.01" />
    <path d="M9 18v.01" />
  </svg>
);
const IconList = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const IconDollar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
const IconDownload = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);
const IconArchive = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
    <path d="M10 12h4" />
  </svg>
);
const IconTraffic = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);
const IconEye = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IconScroll = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </svg>
);
const IconPie = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);
const IconPlug = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 22v-5" />
    <path d="M9 8V2" />
    <path d="M15 8V2" />
    <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
  </svg>
);
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IconLayers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconSupport = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);
const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconCreditCard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);
type NavItem = { href: string; labelKey: string; icon: React.ReactNode; teamOnly?: boolean; billingOnly?: boolean; firmSettingsOnly?: boolean; integrationsOnly?: boolean; auditOnly?: boolean; analyticsUsageOnly?: boolean; staffOnly?: boolean; platformAdminOnly?: boolean };
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: <IconDashboard /> },
  { href: "/dashboard/cases", labelKey: "nav.cases", icon: <IconFolder /> },
  { href: "/dashboard/documents", labelKey: "nav.documents", icon: <IconFile /> },
  { href: "/dashboard/chronologies", labelKey: "nav.chronologies", icon: <IconScroll /> },
  { href: "/dashboard/demands", labelKey: "nav.demands", icon: <IconDollar /> },
  { href: "/dashboard/records-requests", labelKey: "nav.recordsRequests", icon: <IconClipboard /> },
  { href: "/dashboard/exports", labelKey: "nav.exports", icon: <IconDownload />, staffOnly: true },
  { href: "/dashboard/migration", labelKey: "nav.migration", icon: <IconArchive />, staffOnly: true },
  { href: "/dashboard/review", labelKey: "nav.reviewQueue", icon: <IconEye />, staffOnly: true },
  { href: "/dashboard/analytics", labelKey: "nav.reports", icon: <IconChart />, analyticsUsageOnly: true },
  { href: "/dashboard/traffic", labelKey: "nav.traffic", icon: <IconTraffic />, staffOnly: true },
  { href: "/dashboard/providers", labelKey: "nav.providers", icon: <IconBuilding />, staffOnly: true },
  { href: "/dashboard/control-tower", labelKey: "nav.controlTower", icon: <IconLayers />, staffOnly: true },
  { href: "/dashboard/audit", labelKey: "nav.audit", icon: <IconScroll />, auditOnly: true },
  { href: "/dashboard/usage", labelKey: "nav.usage", icon: <IconPie />, analyticsUsageOnly: true },
  { href: "/dashboard/team", labelKey: "nav.team", icon: <IconUsers />, teamOnly: true },
  { href: "/dashboard/integrations", labelKey: "nav.integrations", icon: <IconPlug />, integrationsOnly: true },
  { href: "/dashboard/support/report", labelKey: "nav.support", icon: <IconSupport /> },
  { href: "/dashboard/settings", labelKey: "nav.settings", icon: <IconSettings /> },
  { href: "/dashboard/billing", labelKey: "nav.billing", icon: <IconCreditCard />, billingOnly: true },
  { href: "/dashboard/settings/firm", labelKey: "nav.firmSettings", icon: <IconSettings />, firmSettingsOnly: true },
];

const ADMIN_NAV_ITEM: NavItem = { href: "/admin/quality", labelKey: "nav.platformAdmin", icon: <IconChart />, platformAdminOnly: true };

export function DashboardSidebar() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const { role, isPlatformAdmin } = useDashboardAuth();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.teamOnly && !canAccessTeam(role)) return false;
    if (item.billingOnly && !canAccessBilling(role)) return false;
    if (item.firmSettingsOnly && !canAccessFirmSettings(role)) return false;
    if (item.integrationsOnly && !canAccessIntegrations(role)) return false;
    if (item.auditOnly && !canAccessAuditQuality(role)) return false;
    if (item.analyticsUsageOnly && !canAccessAuditQuality(role)) return false;
    if (item.staffOnly && !isStaffOrAbove(role)) return false;
    if (item.platformAdminOnly && !isPlatformAdmin) return false;
    return true;
  });
  const navItemsWithAdmin = isPlatformAdmin ? [...visibleItems, ADMIN_NAV_ITEM] : visibleItems;

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
              Premium legal operations
            </span>
          </span>
        </Link>
      </div>
      <nav style={{ flex: 1, padding: "0.95rem 0.65rem 0.75rem", overflowY: "auto" }}>
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
          Workspace
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {navItemsWithAdmin.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
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
                  <span>{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
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
            Trusted workflow
          </p>
          <p
            style={{
              margin: "0.45rem 0 0",
              fontSize: "0.8rem",
              lineHeight: 1.55,
              color: "var(--onyx-sidebar-muted)",
            }}
          >
            Review, migration, and exports stay visible from intake through delivery.
          </p>
        </div>
      </div>
    </aside>
  );
}
