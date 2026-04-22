import { ReactNode } from "react";

export function DashboardCard({
  title,
  children,
  className = "",
  style,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const isSupportCard = className.includes("support-report-card");
  return (
    <div
      className={`onyx-card ${className}`}
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "1.5rem 1.375rem",
        borderRadius: "var(--onyx-radius-lg)",
        ...style,
      }}
    >
      {title && (
        <div style={{ marginBottom: "1.125rem" }}>
          <div
            style={{
              width: "2.35rem",
              height: "3px",
              borderRadius: "999px",
              background: "var(--onyx-gradient-gold)",
              marginBottom: "0.8rem",
            }}
          />
          <h3
            className={isSupportCard ? "support-report-card__heading" : undefined}
            style={{
              margin: 0,
              fontSize: isSupportCard ? undefined : "var(--onyx-dash-font-md)",
              fontWeight: 700,
              color: "var(--onyx-text)",
              letterSpacing: "-0.015em",
            }}
          >
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  );
}
