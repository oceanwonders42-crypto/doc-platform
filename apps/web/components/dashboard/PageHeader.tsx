import { ReactNode } from "react";
import { Breadcrumbs, BreadcrumbItem } from "./Breadcrumbs";

export function PageHeader({
  breadcrumbs,
  title,
  description,
  action,
  size = "default",
}: {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "default" | "large";
}) {
  const isLarge = size === "large";
  return (
    <div
      className={isLarge ? "page-header--large" : undefined}
      style={{
        padding: "var(--onyx-content-padding) var(--onyx-content-padding) 0",
        marginBottom: isLarge ? "1.75rem" : "1.4rem",
      }}
    >
      <Breadcrumbs items={breadcrumbs} className={isLarge ? "page-header__breadcrumbs" : undefined} />
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          marginTop: isLarge ? "1rem" : "0.875rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: "46rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              marginBottom: "0.7rem",
              padding: "0.3rem 0.65rem",
              borderRadius: "999px",
              background: "rgba(18, 60, 115, 0.08)",
              border: "1px solid rgba(18, 60, 115, 0.1)",
              color: "var(--onyx-accent)",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Onyx Intel
          </div>
          <h1
            className={isLarge ? "page-header__title" : undefined}
            style={{
              margin: 0,
              fontFamily: "var(--onyx-font-display)",
              fontSize: isLarge ? undefined : "1.85rem",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              color: "var(--onyx-text)",
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              className={isLarge ? "page-header__description" : undefined}
              style={{
                margin: "0.55rem 0 0",
                fontSize: isLarge ? undefined : "0.95rem",
                color: "var(--onyx-text-secondary)",
                lineHeight: 1.65,
              }}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>{action}</div>}
      </div>
    </div>
  );
}
