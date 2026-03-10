import { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Small muted text below description (e.g. "Last updated: ...") */
  meta?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 24,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{title}</h1>
        {description && (
          <p style={{ fontSize: 14, color: "#666", marginTop: 4, lineHeight: 1.5 }}>{description}</p>
        )}
        {meta && (
          <p style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{meta}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
