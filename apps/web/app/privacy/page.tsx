import Link from "next/link";

export const metadata = {
  title: "Privacy",
  description: "Privacy policy for Doc Platform.",
};

export default function PrivacyPage() {
  return (
    <div className="dashboard-content-narrow dashboard-theme" style={{ padding: "2rem 1.5rem", margin: "0 auto" }}>
      <h1 className="page-header--large" style={{ fontSize: "1.875rem", fontWeight: 600, marginBottom: "1rem" }}>
        Privacy
      </h1>
      <p style={{ color: "var(--onyx-text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
        We don&apos;t sell your data. We use it only to provide and improve our document intelligence and case management services.
        Data is processed in accordance with our terms of service and applicable law.
      </p>
      <p style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        For full details, contact your account administrator or support.
      </p>
      <Link href="/" className="dashboard-back-link">
        ← Back to home
      </Link>
    </div>
  );
}
