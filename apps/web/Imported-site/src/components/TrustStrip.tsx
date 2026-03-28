import Link from "next/link";

/**
 * Trust & legal strip for footer — premium, scannable.
 */
export default function TrustStrip() {
  const items = [
    {
      href: "/security",
      label: "Security",
      summary: "Encryption, access controls, HIPAA-ready infrastructure.",
    },
    {
      href: "/privacy",
      label: "Privacy",
      summary: "We don’t sell your data. Clear use and your rights.",
    },
    {
      href: "/terms",
      label: "Terms",
      summary: "Terms of service and acceptable use.",
    },
  ];

  return (
    <div className="mt-12 border-t border-[var(--border-subtle)] pt-10">
      <p className="mb-5 text-center landing-eyebrow">
        Trust & legal
      </p>
      <div className="grid gap-4 text-center sm:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card flex flex-col items-center px-6 py-5 text-center transition-all duration-200 hover:-translate-y-0.5"
          >
            <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">{item.label}</span>
            <span className="mt-2 block text-xs leading-[1.5] text-[var(--text-secondary)]">
              {item.summary}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
