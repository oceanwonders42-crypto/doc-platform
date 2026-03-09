import Link from "next/link";

interface PageCTAProps {
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export default function PageCTA({
  title = "Ready to transform your medical records workflow?",
  description = "Join PI firms that have cut document processing time by up to 90%. See how Onyx Intel can work for your practice.",
  primaryLabel = "Request a Demo",
  primaryHref = "/demo",
  secondaryLabel = "See How It Works",
  secondaryHref = "/product-tour",
}: PageCTAProps) {
  return (
    <section className="border-t border-[var(--border-default)] bg-[var(--bg-section)] px-5 py-20 sm:px-6 md:py-28 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-[var(--text-secondary)] sm:text-lg">{description}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={primaryHref} className="btn-primary w-full sm:w-auto">
            {primaryLabel}
          </Link>
          {secondaryLabel && secondaryHref && (
            <Link href={secondaryHref} className="btn-secondary w-full sm:w-auto">
              {secondaryLabel}
            </Link>
          )}
        </div>
        <p className="mt-5 text-sm text-[var(--text-muted)]">
          No commitment required · Demo in 15 minutes · Enterprise security
        </p>
      </div>
    </section>
  );
}
