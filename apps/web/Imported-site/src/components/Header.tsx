"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/#platform-modules", label: "Platform" },
    { href: "/#features", label: "Features" },
    { href: "/#who-uses", label: "Who It's For" },
    { href: "/#services-pricing", label: "Pricing" },
    { href: "/login", label: "Demo", cta: true },
    { href: "/#contact", label: "Contact" },
  ];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 backdrop-blur-xl"
      style={{ boxShadow: "0 1px 0 var(--border-subtle)" }}
    >
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-6 px-5 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center transition-opacity duration-200 hover:opacity-90"
          aria-label="Onyx Intel home"
        >
          <span
            className="flex items-center rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5"
            style={{ boxShadow: "var(--shadow-glow), inset 0 1px 0 rgba(255,255,255,0.02)" }}
          >
            <Image
              src="/onyx-intel-logo.png"
              alt="Onyx Intel"
              width={132}
              height={38}
              className="h-7 w-auto object-contain object-left md:h-8"
              priority
            />
          </span>
        </Link>
        <nav className="hidden items-center gap-0.5 md:flex">
          {navLinks.map((link) =>
            link.cta ? (
              <Link
                key={link.href}
                href={link.href}
                className="btn-primary px-5 py-2.5 text-sm"
              >
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium tracking-wide transition-colors duration-200 ${
                  pathname === link.href
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)]/80 hover:text-[var(--text-primary)]"
                }`}
              >
                {link.label}
              </Link>
            )
          )}
        </nav>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-[var(--radius-md)] p-2.5 text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] md:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>
      {mobileMenuOpen && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-4 md:hidden">
          <nav className="flex flex-col gap-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium tracking-wide transition-colors ${
                  link.cta
                    ? "btn-primary"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
