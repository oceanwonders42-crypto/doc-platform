export default function AIDocumentProcessing() {
  const steps = [
    {
      title: "Multi-format ingestion",
      description: "PDFs, scanned images, faxes, and portal exports—our AI handles the full range of medical record formats without manual conversion.",
    },
    {
      title: "Intelligent classification",
      description: "Documents are automatically categorized by type (ER records, imaging, bills, provider notes) and linked to the correct case.",
    },
    {
      title: "Structured extraction",
      description: "Key data—dates, providers, charges, CPT codes—is extracted and validated for accuracy before syncing to your CMS.",
    },
    {
      title: "Human-in-the-loop review",
      description: "Review and override AI outputs before they reach your case files. Full audit trails support compliance and quality control.",
    },
  ];

  return (
    <section id="ai-document-processing" className="border-t border-[#2A2C2E] bg-[#0B0B0C] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#FFFFFF] sm:text-4xl">
            AI document processing
          </h2>
          <p className="mt-4 text-lg text-[#B3B6BA]">
            Purpose-built AI models trained on medical and legal document structures deliver high accuracy with minimal manual correction.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          {steps.map((step, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6 transition-all duration-200 hover:border-[#2A2C2E] hover:shadow-md"
            >
              <h3 className="font-semibold text-[#FFFFFF]">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#B3B6BA]">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
