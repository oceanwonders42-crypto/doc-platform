export default function PlatformOverview() {
  const pillars = [
    {
      title: "Ingest",
      description: "Accept medical records from any source—portals, fax, email, uploads—in any format.",
    },
    {
      title: "Organize",
      description: "AI categorizes, indexes, and structures documents for fast retrieval and case matching.",
    },
    {
      title: "Extract",
      description: "Pull treatment dates, billing data, and provider information automatically.",
    },
    {
      title: "Sync",
      description: "Push processed documents and structured data into your case management system.",
    },
  ];

  return (
    <section id="platform-overview" className="border-t border-[#E5E7EB] bg-[#F5F7F8] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0C] sm:text-4xl">
            Platform overview
          </h2>
          <p className="mt-4 text-lg text-[#6b7280]">
            Onyx Intel is an AI-powered platform that transforms how personal injury firms handle medical records—from intake to demand package.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B0B0C] text-sm font-bold text-white">
                {index + 1}
              </div>
              <h3 className="font-semibold text-[#0B0B0C]">{pillar.title}</h3>
              <p className="mt-2 text-sm text-[#6b7280]">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
