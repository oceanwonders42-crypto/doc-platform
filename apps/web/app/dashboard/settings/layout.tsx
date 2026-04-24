"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSettingsNavActive, settingsNavSections } from "./settingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(240px, 280px) minmax(0, 1fr)",
        gap: "1.25rem",
        alignItems: "start",
      }}
    >
      <aside style={{ padding: "var(--onyx-content-padding) 0 0 var(--onyx-content-padding)" }}>
        <div
          className="onyx-card"
          style={{
            position: "sticky",
            top: "calc(var(--onyx-content-padding) + 0.5rem)",
            padding: "1.25rem",
            borderRadius: "var(--onyx-radius-lg)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--onyx-accent)",
            }}
          >
            Settings
          </p>
          <h2
            style={{
              margin: "0.35rem 0 0.5rem",
              fontFamily: "var(--onyx-font-display)",
              fontSize: "1.3rem",
              letterSpacing: "-0.02em",
            }}
          >
            Firm controls
          </h2>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.6 }}>
            Keep billing, Clio, team access, and firm defaults in one scannable place.
          </p>

          <div style={{ display: "grid", gap: "1rem", marginTop: "1.25rem" }}>
            {settingsNavSections.map((section) => (
              <div key={section.title}>
                <p
                  style={{
                    margin: "0 0 0.55rem",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--onyx-text-muted)",
                  }}
                >
                  {section.title}
                </p>
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  {section.items.map((item) => {
                    const active = isSettingsNavActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        style={{
                          display: "block",
                          padding: "0.75rem 0.85rem",
                          borderRadius: "var(--onyx-radius-md)",
                          textDecoration: "none",
                          border: active ? "1px solid rgba(18, 60, 115, 0.18)" : "1px solid transparent",
                          background: active ? "rgba(18, 60, 115, 0.08)" : "transparent",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            color: active ? "var(--onyx-accent)" : "var(--onyx-text)",
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            marginTop: "0.2rem",
                            fontSize: "0.8rem",
                            lineHeight: 1.5,
                            color: "var(--onyx-text-muted)",
                          }}
                        >
                          {item.description}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
