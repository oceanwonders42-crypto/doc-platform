import { ReactNode } from "react";

type ErrorNoticeTone = "error" | "warning" | "success" | "info";

const TONE_STYLES: Record<
  ErrorNoticeTone,
  { border: string; background: string; label: string; text: string }
> = {
  error: {
    border: "var(--onyx-error)",
    background: "rgba(239, 68, 68, 0.08)",
    label: "Issue",
    text: "var(--onyx-error)",
  },
  warning: {
    border: "#d97706",
    background: "rgba(217, 119, 6, 0.12)",
    label: "Heads up",
    text: "#92400e",
  },
  success: {
    border: "var(--onyx-success)",
    background: "rgba(34, 197, 94, 0.08)",
    label: "Update",
    text: "var(--onyx-success)",
  },
  info: {
    border: "rgba(18, 60, 115, 0.18)",
    background: "rgba(18, 60, 115, 0.06)",
    label: "Info",
    text: "var(--onyx-accent)",
  },
};

export function ErrorNotice({
  message,
  title,
  tone = "error",
  action,
  style,
}: {
  message: ReactNode;
  title?: string;
  tone?: ErrorNoticeTone;
  action?: ReactNode;
  style?: React.CSSProperties;
}) {
  const colors = TONE_STYLES[tone];

  return (
    <div
      className="onyx-card"
      style={{
        padding: "1rem 1.1rem",
        borderColor: colors.border,
        background: colors.background,
        ...style,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "0.72rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: colors.text,
        }}
      >
        {title ?? colors.label}
      </p>
      <div
        style={{
          marginTop: "0.45rem",
          fontSize: "0.9rem",
          lineHeight: 1.55,
          color: tone === "info" ? "var(--onyx-text)" : colors.text,
        }}
      >
        {message}
      </div>
      {action ? <div style={{ marginTop: "0.7rem" }}>{action}</div> : null}
    </div>
  );
}
