import Link from "next/link";

interface CTASectionProps {
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
  className?: string;
}

export default function CTASection({
  title = "Ready to transform your document workflow?",
  description = "See how Onyx Intel can work for your firm. Book a 15-minute demo — no commitment required.",
  primaryLabel = "Book a demo",
  primaryHref = "/demo",
  secondaryLabel,
  secondaryHref,
  note = "No commitment · 15-minute walkthrough · Enterprise security",
  className = "",
}: CTASectionProps) {
  return (
    <section
      className={`border-t border-[var(--border-subtle)] bg-[var(--bg-section)] px-5 py-24 sm:px-6 md:py-32 lg:px-8 ${className}`}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] antialiased sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-[1.65] text-[var(--text-secondary)] sm:text-lg">
          {description}
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link href={primaryHref} className="btn-primary w-full min-w-[10rem] sm:w-auto">
            {primaryLabel}
          </Link>
          {secondaryLabel && secondaryHref && (
            <Link href={secondaryHref} className="btn-secondary w-full min-w-[10rem] sm:w-auto">
              {secondaryLabel}
            </Link>
          )}
        </div>
        {note && (
          <p className="mt-6 text-sm text-[var(--text-muted)]">{note}</p>
        )}
      </div>
    </section>
  );
}
