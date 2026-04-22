import { ReactNode } from "react";

export type TimelineItem = {
  id: string;
  date: string;
  title: string;
  description?: string;
  meta?: string;
  /** When true, date is unknown or low-confidence; show as "Date unknown" or with a subtle badge */
  dateUncertain?: boolean;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div style={{ position: "relative" }}>
      {items.map((item, i) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            gap: "1rem",
            paddingBottom: i < items.length - 1 ? "1.25rem" : 0,
            position: "relative",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--onyx-accent)",
              flexShrink: 0,
              marginTop: 6,
            }}
          />
          {i < items.length - 1 && (
            <div
              style={{
                position: "absolute",
                left: 4,
                top: 22,
                bottom: 0,
                width: 2,
                background: "var(--onyx-border)",
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9375rem" }}>{item.title}</p>
            {item.description && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{item.description}</p>
            )}
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
              {item.date}
              {item.dateUncertain && (
                <span style={{ marginLeft: "0.35rem", fontSize: "0.7rem", opacity: 0.9 }} title="Date from document could not be determined with confidence">
                  (date unknown)
                </span>
              )}
              {item.meta && ` · ${item.meta}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
