import Link from "next/link";

export const metadata = {
  title: "Terms of Service",
  description: "Terms of service for Doc Platform.",
};

export default function TermsPage() {
  return (
    <div className="dashboard-content-narrow dashboard-theme" style={{ padding: "2rem 1.5rem", margin: "0 auto" }}>
      <h1 className="page-header--large" style={{ fontSize: "1.875rem", fontWeight: 600, marginBottom: "1rem" }}>
        Terms of Service
      </h1>
      <p style={{ color: "var(--onyx-text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
        Use of Doc Platform is governed by our terms of service and acceptable use policy.
        By using the platform you agree to these terms and to use the service in compliance with applicable law.
      </p>
      <p style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        For the full agreement, contact your account administrator or support.
      </p>
      <Link href="/" className="dashboard-back-link">
        ← Back to home
      </Link>
    </div>
  );
}
