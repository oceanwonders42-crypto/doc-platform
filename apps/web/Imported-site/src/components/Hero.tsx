import Link from "next/link";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 pt-32 pb-28 sm:px-6 md:pt-40 md:pb-32 lg:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem]"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(18, 60, 115, 0.12), transparent 42%), radial-gradient(circle at top right, rgba(201, 162, 39, 0.18), transparent 34%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl text-center">
        <p className="landing-eyebrow">AI-powered document intelligence for PI firms</p>

        <div className="mt-6 flex justify-center">
          <span
            className="inline-flex items-center rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-8 py-5"
            style={{ boxShadow: "var(--shadow-glow), var(--shadow-card), 0 16px 36px rgba(11, 35, 68, 0.08)" }}
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

        <h1 className="mt-10 landing-heading">
          Turn medical records into case-ready chronologies and demands
        </h1>

        <p className="landing-body mx-auto mt-6 max-w-2xl text-lg sm:text-xl">
          AI extracts, organizes, and flags gaps so your team spends less time sorting documents
          and more time building cases.
        </p>

        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
          <Link href="/login" className="btn-primary w-full min-w-[10rem] sm:w-auto">
            Sign in to Dashboard
          </Link>
          <Link href="/login" className="btn-secondary w-full min-w-[10rem] sm:w-auto">
            Book a demo
          </Link>
          <Link href="/#platform-modules" className="btn-secondary-muted w-full min-w-[10rem] sm:w-auto">
            See Platform
          </Link>
        </div>

        <p className="mt-6 text-sm text-[var(--text-muted)]">
          No commitment - 15-minute walkthrough - HIPAA-ready
        </p>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Premium review workflow",
              body: "Clear document status, elegant queues, and restrained visual hierarchy for case teams.",
            },
            {
              title: "Trusted handoff and export",
              body: "Migration and export paths stay visible so staff can rely on what leaves the system.",
            },
            {
              title: "Built for legal operations",
              body: "A blue, gold, and white experience tuned for high-trust enterprise work.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="card text-left"
              style={{ padding: "1.35rem 1.25rem", boxShadow: "var(--shadow-card)" }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--accent-gold)",
                }}
              >
                {item.title}
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3 border-t border-[var(--border-default)] pt-12">
          {["PI firms", "Paralegals & case managers", "Legal assistants", "Management"].map((item) => (
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
