import {
  getCanonicalEntitlementPlanSlug,
  getPlanEntitlements,
  type CanonicalEntitlementPlanSlug,
  type PlanEntitlements,
  type RecurringEntitlementPlanSlug,
} from "./planEntitlements";

export function getCanonicalPolicyPlanSlug(
  planSlug: string | null | undefined
): CanonicalEntitlementPlanSlug | null {
  try {
    return getCanonicalEntitlementPlanSlug(planSlug);
  } catch {
    return null;
  }
}

export function getCanonicalRecurringPolicyPlanSlug(
  planSlug: string | null | undefined
): RecurringEntitlementPlanSlug | null {
  const canonicalPlan = getCanonicalPolicyPlanSlug(planSlug);
  if (
    canonicalPlan === "essential" ||
    canonicalPlan === "growth" ||
    canonicalPlan === "premium"
  ) {
    return canonicalPlan;
  }
  return null;
}

export function hasRecurringPlanEntitlements(
  planSlug: string | null | undefined
): boolean {
  return getCanonicalRecurringPolicyPlanSlug(planSlug) != null;
}

export function getRecurringPlanEntitlements(
  planSlug: string | null | undefined
): PlanEntitlements | null {
  const recurringPlan = getCanonicalRecurringPolicyPlanSlug(planSlug);
  return recurringPlan ? getPlanEntitlements(recurringPlan) : null;
}

export function getDemandMonthlyCap(
  planSlug: string | null | undefined
): number | null {
  return getRecurringPlanEntitlements(planSlug)?.demandLimitMonthly ?? null;
}

export function canUseEmailAutomation(
  planSlug: string | null | undefined
): boolean {
  return getRecurringPlanEntitlements(planSlug)?.emailAutomation ?? false;
}

export function canUseClioAutoUpdate(
  planSlug: string | null | undefined
): boolean {
  return getRecurringPlanEntitlements(planSlug)?.clioAutoUpdate ?? false;
}

export function canUseAdvancedSummaries(
  planSlug: string | null | undefined
): boolean {
  return getRecurringPlanEntitlements(planSlug)?.advancedSummaries ?? false;
}
