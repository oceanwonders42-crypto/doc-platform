import Link from "next/link";
import { AddProviderForm } from "../AddProviderForm";

export default function NewProviderPage() {
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 560,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Add provider
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Create a new provider record for requesting medical records.
      </p>

      <AddProviderForm />

      <p style={{ fontSize: 14, marginTop: 16 }}>
        <Link
          href="/providers"
          style={{ color: "#06c", textDecoration: "underline" }}
        >
          ← Back to provider directory
        </Link>
      </p>
    </main>
  );
}
