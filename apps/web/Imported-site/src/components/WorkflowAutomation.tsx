export default function WorkflowAutomation() {
  const automations = [
    {
      title: "Document routing",
      description: "Automatically route processed documents to the correct case folder in your CMS based on patient, provider, and date.",
    },
    {
      title: "Field population",
      description: "Push extracted data—billing totals, treatment dates, provider names—into case fields without manual data entry.",
    },
    {
      title: "Rule-based workflows",
      description: "Configure custom rules by case type, stage, or firm preferences. Route exceptions to designated reviewers.",
    },
    {
      title: "Sync scheduling",
      description: "Choose real-time or batch sync. Keep your CMS updated on your schedule without disrupting workflow.",
    },
  ];

  return (
    <section id="workflow-automation" className="border-t border-[#2A2C2E] bg-[#0B0B0C] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#FFFFFF] sm:text-4xl">
            Workflow automation
          </h2>
          <p className="mt-4 text-lg text-[#B3B6BA]">
            Reduce manual steps from intake to demand package. Onyx Intel automates routing, field updates, and sync—so your team focuses on case strategy.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
          {automations.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6 transition-all duration-200 hover:shadow-md"
            >
              <h3 className="font-semibold text-[#FFFFFF]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#B3B6BA]">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
