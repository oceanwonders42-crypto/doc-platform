import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav style={{ fontSize: 13, color: "#666", marginBottom: 12 }} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: "0 6px", color: "#999" }}>/</span>}
          {item.href ? (
            <Link href={item.href} style={{ color: "#06c", textDecoration: "underline" }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: "#111", fontWeight: 500 }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
