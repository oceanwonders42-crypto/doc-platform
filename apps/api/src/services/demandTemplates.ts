import { prisma } from "../db/prisma";

export const DEFAULT_DEMAND_TEMPLATE_SECTIONS = [
  "facts_liability",
  "injuries",
  "treatment_chronology",
  "bills",
  "missing_records",
  "damages",
  "demand_amount",
  "exhibits",
] as const;

export type DemandTemplateSelection = {
  id: string;
  name: string;
  version: number;
  firmId: string | null;
  caseType: string | null;
  demandType: string | null;
  requiredSections: string[];
  structureJson: unknown;
  examplesText: string | null;
  scope: "firm" | "default";
};

export const DEFAULT_DEMAND_TEMPLATE: DemandTemplateSelection = {
  id: "default-demand-template",
  name: "Onyx Default Demand Template",
  version: 1,
  firmId: null,
  caseType: null,
  demandType: null,
  requiredSections: [...DEFAULT_DEMAND_TEMPLATE_SECTIONS],
  structureJson: {
    sections: [
      "facts_liability",
      "injuries",
      "treatment_chronology",
      "bills",
      "missing_records",
      "damages",
      "demand_amount",
      "exhibits",
    ],
  },
  examplesText: null,
  scope: "default",
};

function matchesTemplateValue(templateValue: string | null, requestedValue: string | null | undefined): boolean {
  if (!templateValue) return true;
  if (!requestedValue) return false;
  return templateValue.trim().toLowerCase() === requestedValue.trim().toLowerCase();
}

function templateSpecificityScore(template: {
  firmId: string | null;
  caseType: string | null;
  demandType: string | null;
}): number {
  return (template.firmId ? 4 : 0) + (template.caseType ? 2 : 0) + (template.demandType ? 1 : 0);
}

export async function resolveDemandTemplate(input: {
  firmId: string;
  caseType?: string | null;
  demandType?: string | null;
}): Promise<DemandTemplateSelection> {
  const candidates = await prisma.demandTemplate.findMany({
    where: {
      isActive: true,
      OR: [{ firmId: input.firmId }, { firmId: null }],
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
  });

  const matchingTemplate = candidates
    .filter(
      (template) =>
        template.isActive &&
        matchesTemplateValue(template.caseType, input.caseType) &&
        matchesTemplateValue(template.demandType, input.demandType)
    )
    .sort((left, right) => {
      const specificityDelta = templateSpecificityScore(right) - templateSpecificityScore(left);
      if (specificityDelta !== 0) return specificityDelta;
      return right.version - left.version;
    })[0];

  if (!matchingTemplate) return DEFAULT_DEMAND_TEMPLATE;

  return {
    id: matchingTemplate.id,
    name: matchingTemplate.name,
    version: matchingTemplate.version,
    firmId: matchingTemplate.firmId,
    caseType: matchingTemplate.caseType,
    demandType: matchingTemplate.demandType,
    requiredSections:
      matchingTemplate.requiredSections.length > 0
        ? matchingTemplate.requiredSections
        : [...DEFAULT_DEMAND_TEMPLATE_SECTIONS],
    structureJson: matchingTemplate.structureJson,
    examplesText: matchingTemplate.examplesText,
    scope: matchingTemplate.firmId ? "firm" : "default",
  };
}
