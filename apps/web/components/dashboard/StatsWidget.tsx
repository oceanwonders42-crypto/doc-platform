import { ReactNode } from "react";

export function StatsWidget({
  label,
  value,
  subtext,
  icon,
  skeleton = false,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: ReactNode;
  skeleton?: boolean;
}) {
  return (
    <div
      className="onyx-card"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "1.375rem 1.25rem",
        borderRadius: "var(--onyx-radius-lg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.09em" }}>
            {label}
          </p>
          {skeleton ? (
            <>
              <div className="onyx-skeleton" style={{ width: 48, height: 26, marginTop: 6 }} />
              <div className="onyx-skeleton" style={{ width: "70%", height: 12, marginTop: 6 }} />
            </>
          ) : (
            <>
              <p style={{ margin: "0.4rem 0 0", fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.04em", color: "var(--onyx-text)" }}>
                {value}
              </p>
              {subtext && (
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted-soft)" }}>
                  {subtext}
                </p>
              )}
            </>
          )}
        </div>
        {icon && !skeleton && (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: "2.75rem",
              height: "2.75rem",
              borderRadius: "999px",
              background: "linear-gradient(135deg, rgba(18, 60, 115, 0.1), rgba(201, 162, 39, 0.18))",
              color: "var(--onyx-accent)",
              boxShadow: "inset 0 0 0 1px rgba(18, 60, 115, 0.08)",
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
