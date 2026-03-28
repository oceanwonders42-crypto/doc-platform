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
        padding: "1.5rem 1.375rem",
        borderRadius: "var(--onyx-radius-lg)",
        ...style,
      }}
    >
      {title && (
        <h3
          className={isSupportCard ? "support-report-card__heading" : undefined}
          style={{
            margin: "0 0 1.125rem",
            fontSize: isSupportCard ? undefined : "var(--onyx-dash-font-md)",
            fontWeight: 600,
            color: "var(--onyx-text)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
