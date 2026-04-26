/**
 * Feature flags for firm add-ons (e.g. insurance_extraction, court_extraction).
 * Firms can have features stored in Firm.features as a JSON array of strings.
 */
import { prisma } from "../db/prisma";
import { normalizePlanSlug, type CanonicalPlanSlug } from "./billingPlans";

const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "off", "no"]);
const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "on", "yes"]);

export const EMAIL_AUTOMATION_ENV_NAME = "EMAIL_AUTOMATION_ENABLED";

const FEATURE_PLAN_ALLOWLIST: Record<string, CanonicalPlanSlug[]> = {
  case_qa_enabled: ["essential", "growth", "premium"],
  missing_records_enabled: ["essential", "growth", "premium"],
  bills_vs_treatment_enabled: ["essential", "growth", "premium"],
  demand_drafts_enabled: ["essential", "growth", "premium"],
  demand_audit_enabled: ["essential", "growth", "premium"],
  providers_map_enabled: ["essential", "growth", "premium", "paperless_transition"],
  providers_enabled: ["growth", "premium", "paperless_transition"],
  exports_enabled: ["growth", "premium", "paperless_transition"],
  migration_batch_enabled: ["premium", "paperless_transition"],
  traffic_enabled: ["premium"],
};

function readBooleanEnvFlag(envName: string, defaultValue: boolean): boolean {
  const rawValue = process.env[envName];
  if (rawValue == null) return defaultValue;

  const normalizedValue = rawValue.trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalizedValue)) return true;
  if (BOOLEAN_FALSE_VALUES.has(normalizedValue)) return false;
  return defaultValue;
}

export async function hasFeature(firmId: string, feature: string): Promise<boolean> {
  const now = new Date();
  const [firm, override] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: firmId },
      select: { features: true, plan: true },
    }),
    prisma.firmFeatureOverride.findFirst({
      where: {
        firmId,
        featureKey: feature,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { enabled: true },
    }),
  ]);
  const planAllowsFeature = isFeatureAllowedForPlan(firm?.plan, feature);
  if (override) return override.enabled && planAllowsFeature;

  return planAllowsFeature && hasStoredFeatureValue(firm?.features, feature);
}

export function isFeatureAllowedForPlan(plan: string | null | undefined, feature: string): boolean {
  const allowedPlans = FEATURE_PLAN_ALLOWLIST[feature];
  if (!allowedPlans) return true;
  return allowedPlans.includes(normalizePlanSlug(plan));
}

export function hasStoredFeatureValue(features: unknown, feature: string): boolean {
  if (!features || !Array.isArray(features)) {
    return process.env.NODE_ENV !== "production" && feature === "duplicates_detection";
  }
  return features.includes(feature);
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
