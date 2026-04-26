import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import { resolveDemandTemplate } from "./demandTemplates";

type DemandTemplateFindMany = typeof prisma.demandTemplate.findMany;

function stubFindMany(items: Awaited<ReturnType<DemandTemplateFindMany>>): DemandTemplateFindMany {
  return ((..._args: Parameters<DemandTemplateFindMany>) =>
    Promise.resolve(items) as ReturnType<DemandTemplateFindMany>) as unknown as DemandTemplateFindMany;
}

async function main() {
  const delegate = prisma.demandTemplate as { findMany: DemandTemplateFindMany };
  const originalFindMany = delegate.findMany.bind(prisma.demandTemplate);

  try {
    delegate.findMany = stubFindMany([]);
    const fallback = await resolveDemandTemplate({ firmId: "firm-a", demandType: "demand_package" });
    assert.equal(fallback.scope, "default");
    assert.equal(fallback.name, "Onyx Default Demand Template");

    delegate.findMany = stubFindMany([
      {
        id: "global",
        firmId: null,
        name: "Global",
        caseType: null,
        demandType: "demand_package",
        version: 1,
        isActive: true,
        requiredSections: ["facts_liability"],
        structureJson: null,
        examplesText: null,
        createdByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "firm",
        firmId: "firm-a",
        name: "Firm Template",
        caseType: null,
        demandType: "demand_package",
        version: 2,
        isActive: true,
        requiredSections: ["injuries"],
        structureJson: null,
        examplesText: "Example",
        createdByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);
    const firmTemplate = await resolveDemandTemplate({ firmId: "firm-a", demandType: "demand_package" });
    assert.equal(firmTemplate.scope, "firm");
    assert.equal(firmTemplate.name, "Firm Template");
    assert.deepEqual(firmTemplate.requiredSections, ["injuries"]);

    delegate.findMany = stubFindMany([
      {
        id: "inactive-not-returned-by-query",
        firmId: "firm-a",
        name: "Specific but unmatched",
        caseType: "premises",
        demandType: "demand_package",
        version: 9,
        isActive: true,
        requiredSections: ["damages"],
        structureJson: null,
        examplesText: null,
        createdByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);
    const unmatched = await resolveDemandTemplate({ firmId: "firm-a", caseType: "auto", demandType: "demand_package" });
    assert.equal(unmatched.id, "default-demand-template");

    console.log("demand template tests passed");
  } finally {
    delegate.findMany = originalFindMany;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
