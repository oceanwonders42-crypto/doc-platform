"use client";

import { useState } from "react";
import Link from "next/link";
import { getApiBase, getFetchOptions, clearAuthToken } from "@/lib/api";
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
  { href: "/dashboard/control-tower", labelKey: "nav.controlTower" },
  { href: "/dashboard/support/report", labelKey: "nav.support" },
  { href: "/dashboard/settings", labelKey: "nav.settings" },
];

export function DashboardHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { user } = useDashboardAuth();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();

  const handleLogout = () => {
    const base = getApiBase();
    clearAuthToken();
    if (!base) {
      window.location.href = "/login";
      return;
    }
    fetch(`${base}/auth/logout`, { method: "POST", ...getFetchOptions() })
      .then(() => { window.location.href = "/login"; })
      .catch(() => { window.location.href = "/login"; });
  };

  const themes: { id: ThemeId; labelKey: string }[] = [
    { id: "dark", labelKey: "theme.dark" },
    { id: "light", labelKey: "theme.light" },
    { id: "gradient", labelKey: "theme.gradient" },
  ];

  return (
    <header
      className="onyx-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.625rem var(--onyx-content-padding)",
        minHeight: "52px",
      }}
    >
      <button
        type="button"
        className="dashboard-mobile-menu-btn"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={t("nav.toggleMenu")}
        style={{
          padding: "0.5rem",
          color: "var(--onyx-text-muted)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          borderRadius: "var(--onyx-radius-sm)",
        }}
      >
        <svg width={22} height={22} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div style={{ flex: 1, minWidth: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => { setThemeOpen((o) => !o); setLangOpen(false); }}
            aria-label={t("theme.label")}
            style={{
              padding: "0.35rem 0.5rem",
              fontSize: "var(--onyx-dash-font-sm)",
              color: "var(--onyx-text-muted)",
              background: "var(--onyx-surface-elevated)",
              border: "1px solid var(--onyx-border-subtle)",
              borderRadius: "var(--onyx-radius-sm)",
              cursor: "pointer",
            }}
          >
            {t(`theme.${theme}`)}
          </button>
          {themeOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setThemeOpen(false)} aria-hidden />
              <div
                className="onyx-card"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "4px",
                  padding: "0.25rem",
                  minWidth: "120px",
                  zIndex: 20,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                }}
              >
                {themes.map(({ id, labelKey }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTheme(id); setThemeOpen(false); }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.4rem 0.6rem",
                      fontSize: "var(--onyx-dash-font-sm)",
                      textAlign: "left",
                      color: theme === id ? "var(--onyx-accent)" : "var(--onyx-text)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "var(--onyx-radius-sm)",
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
            onClick={() => { setLangOpen((o) => !o); setThemeOpen(false); }}
            aria-label={t("language.label")}
            style={{
              padding: "0.35rem 0.5rem",
              fontSize: "var(--onyx-dash-font-sm)",
              color: "var(--onyx-text-muted)",
              background: "var(--onyx-surface-elevated)",
              border: "1px solid var(--onyx-border-subtle)",
              borderRadius: "var(--onyx-radius-sm)",
              cursor: "pointer",
            }}
          >
            {locale === "es" ? "ES" : "EN"}
          </button>
          {langOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setLangOpen(false)} aria-hidden />
              <div
                className="onyx-card"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "4px",
                  padding: "0.25rem",
                  minWidth: "100px",
                  zIndex: 20,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                }}
              >
                <button
                  type="button"
                  onClick={() => { setLocale("en"); setLangOpen(false); }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    fontSize: "var(--onyx-dash-font-sm)",
                    textAlign: "left",
                    color: locale === "en" ? "var(--onyx-accent)" : "var(--onyx-text)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: "var(--onyx-radius-sm)",
                  }}
                >
                  {t("language.en")}
                </button>
                <button
                  type="button"
                  onClick={() => { setLocale("es"); setLangOpen(false); }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    fontSize: "var(--onyx-dash-font-sm)",
                    textAlign: "left",
                    color: locale === "es" ? "var(--onyx-accent)" : "var(--onyx-text)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: "var(--onyx-radius-sm)",
                  }}
                >
                  {t("language.es")}
                </button>
              </div>
            </>
          )}
        </div>
        {user?.email && (
          <>
            {user.displayName && user.displayName !== user.email && (
              <span
                style={{
                  fontSize: "var(--onyx-dash-font-sm)",
                  color: "var(--onyx-text-secondary)",
                  maxWidth: "120px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.displayName}
              </span>
            )}
            <span
              style={{
                fontSize: "var(--onyx-dash-font-sm)",
                color: "var(--onyx-text-muted)",
                maxWidth: "180px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={user.email}
            >
              {user.email}
            </span>
            {user.role && (
              <span
                className="onyx-badge onyx-badge-neutral"
                style={{ marginLeft: 4, textTransform: "capitalize" }}
                title="Role"
              >
                {String(user.role).toLowerCase()}
              </span>
            )}
          </>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="onyx-link"
          style={{
            fontSize: "var(--onyx-dash-font-sm)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.35rem 0",
          }}
        >
          {t("nav.logOut")}
        </button>
      </div>
      {mobileOpen && (
        <div
          className="onyx-sidebar"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            borderBottom: "1px solid var(--onyx-border-subtle)",
            borderRadius: "0 0 var(--onyx-radius-lg) var(--onyx-radius-lg)",
          }}
        >
          <nav style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "2px" }}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="onyx-link"
                style={{
                  display: "block",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--onyx-radius-md)",
                  fontSize: "var(--onyx-dash-font-base)",
                }}
                onClick={() => setMobileOpen(false)}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
