import { type ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  id?: string;
  /** default | section (slightly elevated) | dark | compact */
  variant?: "default" | "section" | "dark" | "compact";
  className?: string;
}

const variants = {
  default: "bg-[var(--bg-primary)]",
  section: "bg-[var(--bg-section)]",
  dark: "bg-[var(--bg-elevated)]",
  compact: "bg-[var(--bg-primary)]",
};

export default function Section({
  children,
  id,
  variant = "default",
  className = "",
}: SectionProps) {
  const padding = variant === "compact" ? "py-20 md:py-24" : "py-24 md:py-32";
  return (
    <section
      id={id}
      className={`border-t border-[var(--border-subtle)] px-5 sm:px-6 lg:px-8 ${padding} ${variants[variant]} ${className}`}
    >
      {children}
    </section>
  );
}
