import Link from "next/link";

type Props = {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  compact?: boolean;
};

export default function EmptyState({ title, description, action, compact }: Props) {
  return (
    <div
      style={{
        padding: compact ? 20 : 32,
        textAlign: "center",
        background: "#fafafa",
        border: "1px solid #e5e5e5",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          margin: "0 auto 12px",
          borderRadius: "50%",
          border: "2px dashed #ddd",
          background: "#fff",
        }}
        aria-hidden
      />
      <p style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: "0 0 8px 0" }}>{title}</p>
      {description && (
        <p style={{ fontSize: 14, color: "#666", margin: "0 0 16px 0", maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 500,
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            border: "1px solid #111",
          }}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
