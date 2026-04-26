import Link from "next/link";

const navLinks = [
  { href: "/#product", label: "Product" },
  { href: "/#workflows", label: "Workflows" },
  { href: "/security", label: "Security" },
  { href: "/compare", label: "Compare" },
  { href: "/#about", label: "Resources/About" },
];

export default function PublicMarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-3 text-[#0a0a0a] no-underline">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#0a0a0a] text-sm font-black tracking-[0.12em] text-white shadow-sm">
            OI
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-black tracking-[-0.04em]">Onyx Intel</span>
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#6b7280]">
              Document automation
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#525252] lg:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-[#0a0a0a]">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-bold text-[#111111] transition hover:text-[#2563eb]">
            Login
          </Link>
          <Link
            href="/demo"
            className="rounded-full bg-[#0a0a0a] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#2563eb]"
          >
            Book a Demo
          </Link>
        </div>
      </div>
    </header>
  );
}
