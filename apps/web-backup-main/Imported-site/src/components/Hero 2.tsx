import Link from "next/link";

export default function Hero() {
  const trustItems = [
    "Built for PI firms",
    "HIPAA-ready",
    "Integrates with Clio & FileVine",
  ];

  return (
    <section className="relative overflow-hidden bg-[#0a0a0a] px-6 pt-24 pb-32 md:pt-32 md:pb-40">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.06),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_50%,rgba(23,23,23,0.6),transparent)]" />

      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/60 px-4 py-1.5 text-sm text-zinc-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Purpose-built for personal injury law
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            AI Medical Record Intelligence
            <span className="block bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              for Personal Injury Law Firms
            </span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl md:text-2xl">
            Organize medical records, generate treatment timelines, extract
            billing data, and sync everything into your case management system.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="#demo"
              className="w-full rounded-lg bg-blue-600 px-8 py-4 text-center font-semibold text-white shadow-lg shadow-blue-900/25 transition-all hover:bg-blue-500 hover:shadow-blue-900/40 sm:w-auto"
            >
              Request a Demo
            </Link>
            <Link
              href="#how-it-works"
              className="w-full rounded-lg border border-zinc-600 px-8 py-4 text-center font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-900/50 sm:w-auto"
            >
              See How It Works
            </Link>
          </div>
          <p className="mt-6 text-center text-sm font-medium text-zinc-500">
            Reduce hours of manual record review to minutes.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 border-t border-zinc-800/80 pt-12">
            {trustItems.map((item) => (
              <span
                key={item}
                className="flex items-center gap-2 text-sm text-zinc-500"
              >
                <svg
                  className="h-4 w-4 shrink-0 text-zinc-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
