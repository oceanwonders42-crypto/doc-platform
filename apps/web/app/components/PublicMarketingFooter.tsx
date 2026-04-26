import Link from "next/link";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/#workflows", label: "Workflows" },
  { href: "/security", label: "Security" },
  { href: "/compare", label: "Compare" },
  { href: "/demo", label: "Book a Demo" },
];

export default function PublicMarketingFooter() {
  return (
    <footer className="border-t border-[#e5e7eb] bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 text-[#0a0a0a] no-underline">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[#0a0a0a] text-xs font-black tracking-[0.12em] text-white">
              OI
            </span>
            <span className="text-sm font-black tracking-[-0.035em]">Onyx Intel</span>
          </Link>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#525252]">
            A focused legal document-to-demand automation layer for firm email workflows, review,
            chronology, records requests, demand drafting, and Clio writeback.
          </p>
        </div>
        <nav className="flex flex-wrap items-start gap-4 text-sm font-bold text-[#525252] lg:justify-end">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-[#2563eb]">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
