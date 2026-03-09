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
      style={{ padding: "var(--onyx-content-padding) var(--onyx-content-padding) 0", marginBottom: isLarge ? "1.75rem" : "1.25rem" }}
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
        <div>
          <h1
            className={isLarge ? "page-header__title" : undefined}
            style={{
              margin: 0,
              fontSize: isLarge ? undefined : "1.5rem",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--onyx-text)",
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              className={isLarge ? "page-header__description" : undefined}
              style={{
                margin: "0.35rem 0 0",
                fontSize: isLarge ? undefined : "0.875rem",
                color: "var(--onyx-text-muted)",
                lineHeight: 1.45,
              }}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
