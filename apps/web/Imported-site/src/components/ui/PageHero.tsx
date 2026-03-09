interface PageHeroProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export default function PageHero({ title, subtitle, className = "" }: PageHeroProps) {
  return (
    <section
      className={`border-b border-[var(--border-default)] bg-[var(--bg-section)] px-5 py-20 sm:px-6 md:py-28 lg:px-8 ${className}`}
    >
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl md:text-[2.75rem] md:leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
