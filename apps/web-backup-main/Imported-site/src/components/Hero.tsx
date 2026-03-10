import Link from "next/link";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 pt-32 pb-28 sm:px-6 md:pt-40 md:pb-32 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <p className="landing-eyebrow">
          Document intelligence for law firms
        </p>
        <div className="mt-6 flex justify-center">
          <span
            className="inline-flex items-center rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-8 py-5"
            style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}
          >
            <Image
              src="/onyx-intel-logo.png"
              alt="Onyx Intel"
              width={200}
              height={56}
              className="h-12 w-auto object-contain md:h-14"
              priority
            />
          </span>
        </div>
        <h1 className="mt-10 text-4xl font-semibold tracking-tight text-[var(--text-primary)] antialiased sm:text-5xl md:text-6xl md:leading-[1.08]">
          AI Document Intelligence for Modern Law Firms
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-[1.65] text-[var(--text-secondary)] sm:text-xl">
          Onyx Intel helps personal injury firms read, organize, rename, and route legal documents—with workflow support for a more automated, paperless operation.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-base font-medium text-[var(--text-primary)]">
          Works with the CRM you already use.
        </p>
        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
          <Link href="/demo" className="btn-primary w-full min-w-[10rem] sm:w-auto">
            Book a demo
          </Link>
          <Link href="/platform" className="btn-secondary w-full min-w-[10rem] sm:w-auto">
            See how it works
          </Link>
          <Link href="#services-pricing" className="btn-secondary-muted w-full min-w-[10rem] sm:w-auto">
            View pricing
          </Link>
        </div>
        <p className="mt-6 text-sm text-[var(--text-muted)]">
          No commitment · 15-minute walkthrough
        </p>
        <div className="mt-14 flex flex-wrap items-center justify-center gap-3 border-t border-[var(--border-default)] pt-12">
          {["Paperless without CRM change", "HIPAA-ready", "Clio & FileVine"].map((item) => (
            <span
              key={item}
              className="inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-2 text-xs font-medium tracking-wide text-[var(--text-secondary)]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
