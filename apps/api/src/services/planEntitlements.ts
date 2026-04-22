import { normalizePlanSlug, type CanonicalPlanSlug } from "./billingPlans";

export const RECURRING_ENTITLEMENT_PLAN_SLUGS = [
  "essential",
  "growth",
  "premium",
] as const;

const NON_RECURRING_ALLOWED_PLAN_INPUTS = [
  "paperless_transition",
  "starter",
  "professional",
  "enterprise",
] as const;

const ALLOWED_ENTITLEMENT_PLAN_INPUTS = new Set<string>([
  ...RECURRING_ENTITLEMENT_PLAN_SLUGS,
  ...NON_RECURRING_ALLOWED_PLAN_INPUTS,
]);

export type RecurringEntitlementPlanSlug = (typeof RECURRING_ENTITLEMENT_PLAN_SLUGS)[number];
export type PlanEntitlementTier = "ESSENTIAL" | "CORE" | "SCALE";

export type PlanEntitlements = {
  plan: RecurringEntitlementPlanSlug;
  tier: PlanEntitlementTier;
  demandLimitMonthly: number;
  emailAutomation: boolean;
  clioAutoUpdate: boolean;
  advancedSummaries: boolean;
};

export const PLAN_ENTITLEMENTS: Record<RecurringEntitlementPlanSlug, PlanEntitlements> = {
  essential: {
    plan: "essential",
    tier: "ESSENTIAL",
    demandLimitMonthly: 3,
    emailAutomation: false,
    clioAutoUpdate: false,
    advancedSummaries: false,
  },
  growth: {
    plan: "growth",
    tier: "CORE",
    demandLimitMonthly: 15,
    emailAutomation: true,
    clioAutoUpdate: true,
    advancedSummaries: false,
  },
  premium: {
    plan: "premium",
    tier: "SCALE",
    demandLimitMonthly: 30,
    emailAutomation: true,
    clioAutoUpdate: true,
    advancedSummaries: true,
  },
};

export function isRecurringEntitlementPlanSlug(
  planSlug: CanonicalPlanSlug
): planSlug is RecurringEntitlementPlanSlug {
  return planSlug !== "paperless_transition";
}

export function getRecurringEntitlementPlanSlug(
  planSlug: string | null | undefined
): RecurringEntitlementPlanSlug | null {
  if (typeof planSlug !== "string") {
    return null;
  }

  const normalizedInput = planSlug.trim().toLowerCase().replace(/-/g, "_");
  if (!normalizedInput || !ALLOWED_ENTITLEMENT_PLAN_INPUTS.has(normalizedInput)) {
    throw new Error(`Invalid plan label for recurring entitlements: ${String(planSlug)}`);
  }

  const normalizedPlan = normalizePlanSlug(normalizedInput);
  return isRecurringEntitlementPlanSlug(normalizedPlan) ? normalizedPlan : null;
}

export function getPlanEntitlements(planSlug: string | null | undefined): PlanEntitlements | null {
  const recurringPlan = getRecurringEntitlementPlanSlug(planSlug);
  return recurringPlan ? PLAN_ENTITLEMENTS[recurringPlan] : null;
}
