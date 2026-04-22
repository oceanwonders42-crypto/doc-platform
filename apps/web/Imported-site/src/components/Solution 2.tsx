import Link from "next/link";

export default function Solution() {
  return (
    <section id="solution" className="border-t border-zinc-800/50 bg-[#0a0a0a] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-widest text-blue-400">
              The Solution
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              One platform. Complete control over your medical records.
            </h2>
            <p className="mt-6 text-lg text-zinc-400">
              Onyx Intel uses AI to ingest, organize, and structure medical
              records automatically. What used to take paralegals days now
              happens in minutes—with higher accuracy and full audit trails.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Reduce document processing time by up to 90%",
                "Eliminate manual data entry errors",
                "Keep your case management system in sync",
                "Scale without adding headcount",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <span className="text-zinc-300">{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="#demo"
              className="mt-10 inline-block rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Get Started
            </Link>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="mb-4 flex items-center justify-between border-b border-zinc-700/50 pb-3">
                <span className="text-sm font-medium text-zinc-400">
                  Case #2024-0847
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  Synced to Clio
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Treatment Timeline
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">12 entries</p>
                  <p className="mt-0.5 text-xs text-emerald-400">Complete</p>
                </div>
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Providers
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">7 listed</p>
                  <p className="mt-0.5 text-xs text-zinc-400">ER, PCP, PT, Imaging</p>
                </div>
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Billing Totals
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">$47,892</p>
                  <p className="mt-0.5 text-xs text-zinc-400">Extracted</p>
                </div>
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Case Status
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-400">Synced</p>
                  <p className="mt-0.5 text-xs text-zinc-400">Last sync: 2 min ago</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Categorized Documents
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["ER Records (23)", "Imaging (12)", "Bills (8)", "PCP Notes (15)"].map(
                    (cat, i) => (
                      <span
                        key={i}
                        className="rounded-lg bg-zinc-700/50 px-2.5 py-1 text-xs text-zinc-300"
                      >
                        {cat}
                      </span>
                    )
                  )}
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-zinc-500">
                Onyx Intel dashboard — live case view
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
