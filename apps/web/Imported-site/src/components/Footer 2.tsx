import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">Onyx Intel</span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
              AI for PI Law
            </span>
          </div>
          <nav className="flex flex-wrap justify-center gap-6 md:gap-8">
            <Link
              href="#features"
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              How it works
            </Link>
            <Link
              href="#demo"
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Request demo
            </Link>
            <Link
              href="#"
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Privacy
            </Link>
            <Link
              href="#"
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Terms
            </Link>
          </nav>
        </div>
        <div className="mt-8 border-t border-zinc-800 pt-8">
          <p className="text-center text-sm text-zinc-500">
            © {currentYear} Onyx Intel. All rights reserved.
          </p>
          <p className="mt-2 text-center text-xs text-zinc-600">
            Enterprise security · HIPAA-ready · Built for personal injury law
          </p>
        </div>
      </div>
    </footer>
  );
}
