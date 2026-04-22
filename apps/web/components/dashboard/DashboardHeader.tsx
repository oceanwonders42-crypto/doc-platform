"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getApiBase, getFetchOptions, clearAuthToken } from "@/lib/api";
import { isTrafficFeatureEnabled } from "@/lib/devFeatures";
import { useTheme, type ThemeId } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useDashboardAuth } from "@/contexts/DashboardAuthContext";

const NAV_ITEMS: { href: string; labelKey: string }[] = [
  { href: "/dashboard", labelKey: "nav.dashboard" },
  { href: "/dashboard/cases", labelKey: "nav.cases" },
  { href: "/dashboard/traffic", labelKey: "nav.traffic" },
  { href: "/dashboard/documents", labelKey: "nav.documents" },
  { href: "/dashboard/providers", labelKey: "nav.providers" },
  { href: "/dashboard/records-requests", labelKey: "nav.recordsRequests" },
  { href: "/dashboard/exports", labelKey: "nav.exports" },
  { href: "/dashboard/review", labelKey: "nav.reviewQueue" },
  { href: "/dashboard/analytics", labelKey: "nav.analytics" },
  { href: "/dashboard/audit", labelKey: "nav.audit" },
  { href: "/dashboard/usage", labelKey: "nav.usage" },
  { href: "/dashboard/integrations", labelKey: "nav.integrations" },
  { href: "/dashboard/support/report", labelKey: "nav.support" },
  { href: "/dashboard/settings", labelKey: "nav.settings" },
];

export function DashboardHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const { user } = useDashboardAuth();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const trafficEnabled = isTrafficFeatureEnabled();
  const mobileNavItems = NAV_ITEMS.filter(
    (item) => item.href !== "/dashboard/traffic" || trafficEnabled
  );

  const handleLogout = () => {
    const base = getApiBase();
    clearAuthToken();
    if (!base) {
      window.location.href = "/login";
      return;
    }
    fetch(`${base}/auth/logout`, { method: "POST", ...getFetchOptions() })
      .then(() => {
        window.location.href = "/login";
      })
      .catch(() => {
        window.location.href = "/login";
      });
  };

  const themes: { id: ThemeId; labelKey: string }[] = [
    { id: "light", labelKey: "theme.light" },
    { id: "gradient", labelKey: "theme.gradient" },
    { id: "dark", labelKey: "theme.dark" },
  ];

  const userLabel = user?.displayName?.trim() || user?.email || "Onyx Intel";
  const userInitial = userLabel.slice(0, 1).toUpperCase();

  return (
    <header
      className="onyx-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        padding: "0.85rem var(--onyx-content-padding)",
        minHeight: "72px",
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", minWidth: 0 }}>
          <button
            type="button"
            className="dashboard-mobile-menu-btn onyx-control-chip"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={t("nav.toggleMenu")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.75rem",
              height: "2.75rem",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <svg width={22} height={22} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--onyx-accent)",
              }}
            >
              Onyx Intel
            </div>
            <div
              style={{
                color: "var(--onyx-text)",
                fontFamily: "var(--onyx-font-display)",
                fontSize: "1.18rem",
                fontWeight: 700,
                letterSpacing: "-0.035em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Legal Operations Dashboard
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setThemeOpen((open) => !open);
                setLangOpen(false);
              }}
              aria-label={t("theme.label")}
              className="onyx-control-chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.65rem 0.8rem",
                fontSize: "var(--onyx-dash-font-sm)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontWeight: 700, color: "var(--onyx-accent)" }}>Theme</span>
              {t(`theme.${theme}`)}
            </button>
            {themeOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  onClick={() => setThemeOpen(false)}
                  aria-hidden
                />
                <div
                  className="onyx-card"
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "0.55rem",
                    padding: "0.35rem",
                    minWidth: "150px",
                    zIndex: 20,
                  }}
                >
                  {themes.map(({ id, labelKey }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setTheme(id);
                        setThemeOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "0.55rem 0.7rem",
                        fontSize: "var(--onyx-dash-font-sm)",
                        textAlign: "left",
                        color: theme === id ? "var(--onyx-accent)" : "var(--onyx-text)",
                        background: theme === id ? "rgba(18, 60, 115, 0.06)" : "none",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: "var(--onyx-radius-md)",
                        fontWeight: theme === id ? 700 : 500,
                      }}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setLangOpen((open) => !open);
                setThemeOpen(false);
              }}
              aria-label={t("language.label")}
              className="onyx-control-chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.65rem 0.8rem",
                fontSize: "var(--onyx-dash-font-sm)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontWeight: 700, color: "var(--onyx-accent)" }}>Locale</span>
              {locale === "es" ? "ES" : "EN"}
            </button>
            {langOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  onClick={() => setLangOpen(false)}
                  aria-hidden
                />
                <div
                  className="onyx-card"
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "0.55rem",
                    padding: "0.35rem",
                    minWidth: "100px",
                    zIndex: 20,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLocale("en");
                      setLangOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.55rem 0.7rem",
                      fontSize: "var(--onyx-dash-font-sm)",
                      textAlign: "left",
                      color: locale === "en" ? "var(--onyx-accent)" : "var(--onyx-text)",
                      background: locale === "en" ? "rgba(18, 60, 115, 0.06)" : "none",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "var(--onyx-radius-md)",
                      fontWeight: locale === "en" ? 700 : 500,
                    }}
                  >
                    {t("language.en")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocale("es");
                      setLangOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.55rem 0.7rem",
                      fontSize: "var(--onyx-dash-font-sm)",
                      textAlign: "left",
                      color: locale === "es" ? "var(--onyx-accent)" : "var(--onyx-text)",
                      background: locale === "es" ? "rgba(18, 60, 115, 0.06)" : "none",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "var(--onyx-radius-md)",
                      fontWeight: locale === "es" ? 700 : 500,
                    }}
                  >
                    {t("language.es")}
                  </button>
                </div>
              </>
            )}
          </div>

          {user?.email && (
            <div
              className="onyx-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.7rem",
                padding: "0.45rem 0.65rem 0.45rem 0.45rem",
                minHeight: "2.85rem",
              }}
            >
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "999px",
                  background: "var(--onyx-gradient-hero)",
                  color: "var(--onyx-surface)",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                }}
              >
                {userInitial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--onyx-text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "11rem",
                  }}
                >
                  {userLabel}
                </div>
                <div
                  style={{
                    fontSize: "0.74rem",
                    color: "var(--onyx-text-muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "11rem",
                  }}
                  title={user.email}
                >
                  {user.email}
                </div>
              </div>
              {user.role && (
                <span
                  className="onyx-badge onyx-badge-neutral"
                  style={{ textTransform: "capitalize" }}
                  title="Role"
                >
                  {String(user.role).toLowerCase()}
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="onyx-btn-secondary"
            style={{
              fontSize: "var(--onyx-dash-font-sm)",
              cursor: "pointer",
              padding: "0.65rem 0.95rem",
            }}
          >
            {t("nav.logOut")}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 20 }}
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            className="onyx-card"
            style={{
              position: "absolute",
              top: "calc(100% + 0.55rem)",
              left: "var(--onyx-content-padding)",
              right: "var(--onyx-content-padding)",
              padding: "0.65rem",
              zIndex: 30,
            }}
          >
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {mobileNavItems.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="onyx-link"
                    style={{
                      display: "block",
                      padding: "0.7rem 0.85rem",
                      borderRadius: "var(--onyx-radius-md)",
                      fontSize: "var(--onyx-dash-font-base)",
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? "rgba(18, 60, 115, 0.06)" : "transparent",
                    }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
