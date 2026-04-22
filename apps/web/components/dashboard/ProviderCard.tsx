import Link from "next/link";

export function ProviderCard({
  id,
  name,
  caseCount,
  documentCount,
  billingTotal,
}: {
  id: string;
  name: string;
  caseCount?: number;
  documentCount?: number;
  billingTotal?: string | number;
}) {
  return (
    <Link
      href={`/dashboard/providers/${id}`}
      className="onyx-card onyx-link"
      style={{
        display: "block",
        padding: "1.375rem 1.25rem",
        borderRadius: "var(--onyx-radius-lg)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9375rem", letterSpacing: "-0.01em" }}>{name}</p>
      <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
        {caseCount != null && <span>Cases: {caseCount}</span>}
        {documentCount != null && <span>Documents: {documentCount}</span>}
        {billingTotal != null && <span>Billing: {billingTotal}</span>}
      </div>
    </Link>
  );
}
