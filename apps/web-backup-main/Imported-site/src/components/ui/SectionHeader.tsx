interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  centered?: boolean;
  className?: string;
}

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  centered = true,
  className = "",
}: SectionHeaderProps) {
  const align = centered ? "text-center mx-auto" : "";
  const maxWidth = centered ? "max-w-2xl" : "max-w-2xl";

  return (
    <div className={`${align} ${maxWidth} ${className}`}>
      {eyebrow && (
        <p className="landing-eyebrow">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text-primary)] antialiased sm:text-3xl md:text-4xl md:leading-[1.2]">
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-base leading-[1.65] text-[var(--text-secondary)] sm:text-lg ${centered ? "max-w-xl mx-auto" : ""}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
