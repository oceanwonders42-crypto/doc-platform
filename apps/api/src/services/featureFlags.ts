/**
 * Feature flags for firm add-ons (e.g. insurance_extraction, court_extraction).
 * Firms can have features stored in Firm.features as a JSON array of strings.
 */
import { prisma } from "../db/prisma";

const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "off", "no"]);
const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "on", "yes"]);

export const EMAIL_AUTOMATION_ENV_NAME = "EMAIL_AUTOMATION_ENABLED";

function readBooleanEnvFlag(envName: string, defaultValue: boolean): boolean {
  const rawValue = process.env[envName];
  if (rawValue == null) return defaultValue;

  const normalizedValue = rawValue.trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalizedValue)) return true;
  if (BOOLEAN_FALSE_VALUES.has(normalizedValue)) return false;
  return defaultValue;
}

export async function hasFeature(firmId: string, feature: string): Promise<boolean> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { features: true },
  });
  if (!firm?.features) {
    return process.env.NODE_ENV !== "production" && feature === "duplicates_detection";
  }
  const arr = firm.features as unknown;
  if (!Array.isArray(arr)) {
    return process.env.NODE_ENV !== "production" && feature === "duplicates_detection";
  }
  return arr.includes(feature);
}

/** Whether the firm has premium workflow (e.g. bulk operations, advanced reporting). */
export async function hasPremiumWorkflow(firmId: string): Promise<boolean> {
  return hasFeature(firmId, "premium_workflow");
}

/**
 * Global kill switch for the new email automation flow.
 * Defaults enabled so existing automation behavior is preserved unless the env explicitly disables it.
 */
export function isEmailAutomationEnabled(): boolean {
  return readBooleanEnvFlag(EMAIL_AUTOMATION_ENV_NAME, true);
}
