export default function Problem() {
  const painPoints = [
    {
      title: "Chaotic document management",
      description:
        "Medical records arrive in every format imaginable—PDFs, faxes, scanned images—scattered across emails and portals with no structure.",
    },
    {
      title: "Manual timeline creation",
      description:
        "Paralegals spend countless hours piecing together treatment histories from hundreds of pages, prone to human error and inconsistency.",
    },
    {
      title: "Billing data extraction",
      description:
        "Extracting CPT codes, charges, and provider information from complex medical bills is tedious and time-consuming.",
    },
    {
      title: "Disconnected systems",
      description:
        "Documents live in one place while your case management system expects another—manual syncing creates bottlenecks and delays.",
    },
  ];

  return (
    <section id="problem" className="border-t border-zinc-800/50 bg-[#0d0d0d] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Personal injury firms face a document crisis
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Every case brings a flood of medical records. Managing them manually
            drains resources and slows down settlements.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {painPoints.map((point, index) => (
            <div
              key={index}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 transition-colors hover:border-zinc-700"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                <span className="text-lg font-bold">{index + 1}</span>
              </div>
              <h3 className="font-semibold text-white">{point.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
