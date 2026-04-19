import { notFound } from "next/navigation";
import Link from "next/link";
import DemoSeedClient from "./DemoSeedClient";

export default function AdminDemoPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 560,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Admin
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Demo seed</h1>
      </div>

      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        One-click seed of demo data: firm (if none), 3 cases, 10 documents, 8 timeline events. Idempotent: replaces existing demo data for the firm.
      </p>

      <DemoSeedClient />
    </main>
  );
}
