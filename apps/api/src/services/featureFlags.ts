/**
 * Feature flags for firm add-ons (e.g. insurance_extraction, court_extraction).
 * Firms can have features stored in Firm.features as a JSON array of strings.
 */
import { prisma } from "../db/prisma";

export async function hasFeature(firmId: string, feature: string): Promise<boolean> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { features: true },
  });
  if (!firm?.features) return false;
  const arr = firm.features as unknown;
  if (!Array.isArray(arr)) return false;
  return arr.includes(feature);
}

/** True when firm has premium/enterprise plan or premium_workflow feature. Used for advanced workflow and bulk controls. */
export async function hasPremiumWorkflow(firmId: string): Promise<boolean> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { plan: true, features: true },
  });
  if (!firm) return false;
  const plan = (firm.plan ?? "").toLowerCase();
  if (plan === "premium" || plan === "enterprise") return true;
  const arr = firm.features as unknown;
  if (Array.isArray(arr) && arr.includes("premium_workflow")) return true;
  return false;
}
