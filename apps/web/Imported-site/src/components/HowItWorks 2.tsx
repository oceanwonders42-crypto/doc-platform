export default function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Upload your records",
      description:
        "Drag and drop medical records in any format—PDFs, images, faxes. Our AI handles the rest.",
    },
    {
      step: "02",
      title: "AI processes & organizes",
      description:
        "Documents are categorized, indexed, and structured. Treatment timelines and billing data are extracted automatically.",
    },
    {
      step: "03",
      title: "Review & refine",
      description:
        "Review AI-generated outputs, make edits if needed, and export to your case management system.",
    },
    {
      step: "04",
      title: "Sync to your CMS",
      description:
        "Organized records and extracted data sync directly into Clio, FileVine, or your preferred platform.",
    },
  ];

  return (
    <section id="how-it-works" className="relative border-t border-zinc-800/50 bg-[#0a0a0a] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            From chaos to clarity in four simple steps.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="space-y-12 lg:space-y-0">
            {steps.map((item, index) => (
              <div
                key={index}
                className="relative flex flex-col items-start gap-6 lg:flex-row lg:gap-12"
              >
                {index < steps.length - 1 && (
                  <div
                    className="absolute left-[23px] top-14 hidden h-full w-px bg-gradient-to-b from-zinc-600 to-transparent lg:block"
                    aria-hidden="true"
                  />
                )}
                <div className="flex shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-4 font-mono text-2xl font-bold text-blue-400">
                  {item.step}
                </div>
                <div className="flex-1 pb-12 lg:pb-16">
                  <h3 className="text-xl font-semibold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-zinc-400">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
