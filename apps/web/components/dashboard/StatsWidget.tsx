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
        padding: "1.375rem 1.25rem",
        borderRadius: "var(--onyx-radius-lg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 500, color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {label}
          </p>
          {skeleton ? (
            <>
              <div className="onyx-skeleton" style={{ width: 48, height: 26, marginTop: 6 }} />
              <div className="onyx-skeleton" style={{ width: "70%", height: 12, marginTop: 6 }} />
            </>
          ) : (
            <>
              <p style={{ margin: "0.35rem 0 0", fontSize: "1.625rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--onyx-text)" }}>
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
        {icon && !skeleton && <div style={{ color: "var(--onyx-accent)", opacity: 0.85 }}>{icon}</div>}
      </div>
    </div>
  );
}
