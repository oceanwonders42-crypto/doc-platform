export default function SecurityCompliance() {
  const items = [
    {
      title: "HIPAA-ready infrastructure",
      description:
        "Built for healthcare data. Encrypted at rest and in transit, with access controls and audit logging designed to support HIPAA compliance requirements.",
    },
    {
      title: "Enterprise-grade security",
      description:
        "SOC 2 Type II compliant practices, role-based access control, and secure data handling. Your firm's and clients' data is protected at every step.",
    },
    {
      title: "Full audit trail",
      description:
        "Every document ingestion, extraction, and sync is logged. Maintain complete visibility for compliance reviews and internal oversight.",
    },
    {
      title: "Data residency & retention",
      description:
        "Control where your data lives. Configurable retention policies and the ability to export or delete data in accordance with your firm's policies.",
    },
  ];

  return (
    <section id="security" className="border-t border-[#2A2C2E] bg-[#0B0B0C] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#FFFFFF] sm:text-4xl">
            Security and compliance
          </h2>
          <p className="mt-4 text-lg text-[#B3B6BA]">
            Enterprise security standards for law firms handling sensitive medical and client data.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8 sm:mt-20 md:grid-cols-2">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6 transition-all duration-200 hover:shadow-md"
            >
              <h3 className="text-lg font-semibold text-[#FFFFFF]">{item.title}</h3>
              <p className="mt-3 text-[#B3B6BA]">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
