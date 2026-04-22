export default function PlatformCapabilities() {
  const capabilities = [
    {
      title: "AI Medical Record Organization",
      description:
        "Transform chaotic document inflows into structured, searchable case files with minimal manual effort.",
      bullets: [
        "Automatically categorizes records by type (ER, imaging, bills, notes)",
        "Indexes and tags documents for fast retrieval",
        "Handles PDFs, scanned images, faxes, and portal exports",
        "Maintains full audit trail for compliance",
      ],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      title: "Treatment Timeline Generation",
      description:
        "Build court-ready chronological treatment narratives in minutes instead of days.",
      bullets: [
        "Extracts dates, providers, and visit types from records",
        "Generates chronological timeline with source citations",
        "Identifies gaps and inconsistencies for review",
        "Exports in formats ready for demand packages",
      ],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: "Medical Bill Extraction",
      description:
        "Pull itemized charges, CPT codes, and provider details from complex medical bills automatically.",
      bullets: [
        "Extracts line-item charges and totals",
        "Identifies CPT codes and procedure descriptions",
        "Captures provider and facility information",
        "Reduces manual data entry and transcription errors",
      ],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: "Smart Case Matching",
      description:
        "Ensure every document lands in the right case with AI-powered matching and validation.",
      bullets: [
        "Matches incoming documents to cases by patient, provider, and date",
        "Flags potential mismatches for human review",
        "Learns from firm-specific patterns over time",
        "Prevents misplaced or orphaned records",
      ],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      title: "Automated Document Routing",
      description:
        "Send processed documents and extracted data to the right place in your workflow automatically.",
      bullets: [
        "Routes documents to designated case folders",
        "Pushes structured data into case fields",
        "Supports custom routing rules by case type or stage",
        "Eliminates manual file placement and data re-entry",
      ],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: "Case Intelligence Dashboard",
      description:
        "Get a real-time view of document status, extraction results, and sync state across all cases.",
      bullets: [
        "Single view of treatment timelines, billing totals, and document counts",
        "Sync status with your case management system",
        "Alerts for missing records or pending reviews",
        "Export and reporting for case management",
      ],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ),
    },
  ];

  return (
    <section id="platform-capabilities" className="border-t border-[#2A2C2E] bg-[#121314] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#FFFFFF] sm:text-4xl">
            Platform capabilities
          </h2>
          <p className="mt-4 text-lg text-[#B3B6BA]">
            Deep capabilities built for the complexity of personal injury medical records.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-8 sm:mt-20 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap, index) => (
            <div
              key={index}
              className="group rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#3B82F6]/20 text-[#3B82F6]">
                {cap.icon}
              </div>
              <h3 className="text-lg font-semibold text-[#FFFFFF]">{cap.title}</h3>
              <p className="mt-2 text-sm text-[#B3B6BA]">{cap.description}</p>
              <ul className="mt-4 space-y-2">
                {cap.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#B3B6BA]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB]" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
