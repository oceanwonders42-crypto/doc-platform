import Link from "next/link";

export const metadata = {
  title: "Security",
  description: "Security and compliance for Doc Platform.",
};

export default function SecurityPage() {
  return (
    <div className="dashboard-content-narrow dashboard-theme" style={{ padding: "2rem 1.5rem", margin: "0 auto" }}>
      <h1 className="page-header--large" style={{ fontSize: "1.875rem", fontWeight: 600, marginBottom: "1rem" }}>
        Security
      </h1>
      <p style={{ color: "var(--onyx-text-secondary)", lineHeight: 1.6, marginBottom: "1rem" }}>
        We use encryption, access controls, and HIPAA-ready infrastructure to protect your data.
        Documents and case data are processed in secure environments and access is limited to authorized users.
      </p>
      <p style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        For compliance and security documentation, contact your account administrator or support.
      </p>
      <Link href="/" className="dashboard-back-link">
        ← Back to home
      </Link>
    </div>
  );
}
