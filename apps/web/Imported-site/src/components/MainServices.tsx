export default function MainServices() {
  const services = [
    {
      title: "Paperless Conversion for Law Firms",
      description:
        "Turn paper files, scanned records, emails, and loose PDFs into organized digital case files. We help law firms go paperless without forcing them to change their CRM.",
    },
    {
      title: "AI Medical Record Organization",
      description:
        "Automatically organize medical records, bills, imaging, and treatment documents into the right case file using OCR, classification, and case matching.",
    },
    {
      title: "Review Queue and Staff Correction Tools",
      description:
        "Give staff a fast way to review, correct, and approve AI document decisions before anything is finalized.",
    },
    {
      title: "CRM-Ready Document Sync",
      description:
        "Push clean, organized files into the system the firm already uses. Onyx Intel should be positioned as the document intelligence layer, not the CRM itself.",
    },
    {
      title: "Cloud Drive and Folder Automation",
      description:
        "Keep files organized with structured folders, naming conventions, and predictable export workflows for firms not ready for full CRM sync.",
    },
    {
      title: "Records and Billing Packet Generation",
      description:
        "Generate clean records packets, billing packets, and organized case document bundles for staff and attorneys.",
    },
  ];

  return (
    <section id="main-services" className="border-t border-[#2A2C2E] bg-[#0d0d0e] px-6 py-28 md:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#a1a1aa]">
            What we do
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Main services
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[#b3b6ba]">
            Onyx Intel helps law firms go paperless without forcing them to change their CRM.
          </p>
        </div>
        <div className="mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => (
            <div
              key={index}
              className="group flex flex-col rounded-xl border border-[#2A2C2E] bg-[#121314] p-8 shadow-sm transition-all duration-300 hover:border-[#3d3e40] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
            >
              <div className="mb-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#2A2C2E] bg-[#181A1B] text-sm font-medium text-[#a1a1aa] transition-colors group-hover:border-[#3d3e40] group-hover:text-white">
                {index + 1}
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-white">
                {service.title}
              </h3>
              <p className="mt-4 flex-1 text-[15px] leading-relaxed text-[#b3b6ba]">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
