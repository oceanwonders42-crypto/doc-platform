import Link from "next/link";

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <header
        style={{
          borderBottom: "1px solid #e5e5e5",
          padding: "12px 24px",
          background: "#fafafa",
        }}
      >
        <Link
          href="/provider/login"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#111",
            textDecoration: "none",
          }}
        >
          Provider Portal
        </Link>
      </header>
      {children}
    </div>
  );
}
