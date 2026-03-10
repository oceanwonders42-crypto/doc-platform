import Link from "next/link";

export default function ExportsPage() {
  return (

    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" style={{ fontSize: 14, color: "#666", textDecoration: "underline" }}>
          ← Dashboard
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Clio Export</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Download CSV files compatible with Clio Manage import. Import contacts first, then matters.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <a
          href="/api/exports/clio/contacts.csv"
          download="clio-contacts.csv"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
            textAlign: "center",
            maxWidth: 240,
          }}
        >
          Download contacts.csv
        </a>
        <a
          href="/api/exports/clio/matters.csv"
          download="clio-matters.csv"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
            textAlign: "center",
            maxWidth: 240,
          }}
        >
          Download matters.csv
        </a>
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: "#888" }}>
        Contacts are derived from case client names. Matters map case number → display number, title → description.
      </p>
    </main>
  );
}
