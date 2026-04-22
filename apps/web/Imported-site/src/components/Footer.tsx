import Link from "next/link";
import Image from "next/image";
import TrustStrip from "@landing/components/TrustStrip";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const productLinks = [
    { href: "/#features", label: "Platform" },
    { href: "/#features", label: "Features" },
    { href: "/#integrations", label: "Integrations" },
  ];

  const companyLinks = [
    { href: "/#services-pricing", label: "Pricing" },
    { href: "/#faq", label: "FAQ" },
    { href: "/login", label: "Demo" },
  ];

  const legalLinks = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/security", label: "Security" },
  ];

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div className="lg:col-span-1">
            <Link href="/" className="inline-block" aria-label="Onyx Intel home">
              <span
                className="inline-flex items-center rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5"
                style={{ boxShadow: "var(--shadow-glow)" }}
              >
                <Image
                  src="/onyx-intel-logo.png"
                  alt="Onyx Intel"
                  width={132}
                  height={38}
                  className="h-7 w-auto object-contain object-left"
                />
              </span>
            </Link>
            <p className="mt-6 max-w-[280px] text-sm leading-[1.6] text-[var(--text-secondary)]">
              AI Document Intelligence for Law Firms
            </p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--accent-gold)]">
              Blue-chip software for legal operations
            </p>
          </div>

          <div>
            <p className="landing-eyebrow">Product</p>
            <nav className="mt-4 flex flex-col gap-3">
              {productLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <p className="landing-eyebrow">Company</p>
            <nav className="mt-4 flex flex-col gap-3">
              {companyLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <p className="landing-eyebrow">Legal</p>
            <nav className="mt-4 flex flex-col gap-3">
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <TrustStrip />

        <div className="mt-14 border-t border-[var(--border-subtle)] pt-8">
          <p className="text-center text-sm text-[var(--text-secondary)]">
            Copyright {currentYear} Onyx Intel. All rights reserved.
          </p>
          <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
            Enterprise security - HIPAA-ready - Built for law firms
          </p>
        </div>
      </div>
    </footer>
  );
}
