import {
  normalizePlanSlug,
  type CanonicalPlanSlug,
} from "./billingPlans";
import {
  getPlanEntitlements,
  getRecurringEntitlementPlanSlug,
  type PlanEntitlements,
  type RecurringEntitlementPlanSlug,
} from "./planEntitlements";

const POLICY_ACCEPTED_PLAN_INPUTS = new Set([
  "essential",
  "growth",
  "premium",
  "paperless_transition",
  "starter",
  "professional",
  "enterprise",
]);

function normalizePolicyInput(planSlug: string | null | undefined): string | null {
  if (typeof planSlug !== "string") {
    return null;
  }

  const normalized = planSlug.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }

  return POLICY_ACCEPTED_PLAN_INPUTS.has(normalized) ? normalized : null;
}

export function getCanonicalPolicyPlanSlug(
  planSlug: string | null | undefined
): CanonicalPlanSlug | null {
  const normalized = normalizePolicyInput(planSlug);
  return normalized ? normalizePlanSlug(normalized) : null;
}

export function getCanonicalRecurringPolicyPlanSlug(
  planSlug: string | null | undefined
): RecurringEntitlementPlanSlug | null {
  const canonicalPlan = getCanonicalPolicyPlanSlug(planSlug);
  return canonicalPlan ? getRecurringEntitlementPlanSlug(canonicalPlan) : null;
}

export function hasRecurringPlanEntitlements(planSlug: string | null | undefined): boolean {
  return getCanonicalRecurringPolicyPlanSlug(planSlug) != null;
}

export function getRecurringPlanEntitlements(
  planSlug: string | null | undefined
): PlanEntitlements | null {
  const recurringPlan = getCanonicalRecurringPolicyPlanSlug(planSlug);
  return recurringPlan ? getPlanEntitlements(recurringPlan) : null;
}

export function getDemandMonthlyCap(planSlug: string | null | undefined): number | null {
  return getRecurringPlanEntitlements(planSlug)?.demandLimitMonthly ?? null;
}

export function canUseEmailAutomation(planSlug: string | null | undefined): boolean {
  return getRecurringPlanEntitlements(planSlug)?.emailAutomation ?? false;
}

export function canUseClioAutoUpdate(planSlug: string | null | undefined): boolean {
  return getRecurringPlanEntitlements(planSlug)?.clioAutoUpdate ?? false;
}

export function canUseAdvancedSummaries(planSlug: string | null | undefined): boolean {
  return getRecurringPlanEntitlements(planSlug)?.advancedSummaries ?? false;
}
