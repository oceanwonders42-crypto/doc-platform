import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageCTA from "@/components/PageCTA";

export default function SecurityPage() {
  const items = [
    {
      title: "HIPAA-ready infrastructure",
      description:
        "Built for healthcare data. Encryption at rest and in transit, access controls, and audit logging designed to support HIPAA compliance. We provide a BAA (Business Associate Agreement) for firms that require it.",
    },
    {
      title: "Enterprise-grade security",
      description:
        "SOC 2 Type II compliant practices, role-based access control, and secure data handling. Your firm's and clients' data is protected at every step—from ingestion through extraction to sync.",
    },
    {
      title: "Full audit trail",
      description:
        "Every document ingestion, extraction, and sync is logged. Maintain complete visibility for compliance reviews, internal oversight, and client matters. Export audit logs when needed.",
    },
    {
      title: "Data residency & retention",
      description:
        "Control where your data lives. Configurable retention policies and the ability to export or delete data in accordance with your firm's policies and ethical obligations.",
    },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)]">
        <section className="border-b border-[#2A2C2E] bg-[#121314] px-6 py-20 md:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-[#FFFFFF] sm:text-5xl">
              Security and compliance
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-[#B3B6BA]">
              Enterprise security standards for law firms handling sensitive medical and client data.
            </p>
          </div>
        </section>

        <section className="border-b border-[#2A2C2E] px-6 py-24 md:py-32">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-8 md:grid-cols-2">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#2A2C2E] bg-[#121314]/50 p-6 transition-all hover:shadow-md"
                >
                  <h3 className="text-lg font-semibold text-[#FFFFFF]">{item.title}</h3>
                  <p className="mt-3 text-[#B3B6BA]">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PageCTA
          title="Questions about security?"
          description="Our team can walk you through our security practices and compliance posture. Schedule a demo to learn more."
        />
      </main>
      <Footer />
    </>
  );
}
