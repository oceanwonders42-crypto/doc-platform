export const RECURRING_ENTITLEMENT_PLAN_SLUGS = [
  "essential",
  "growth",
  "premium",
] as const;

const LEGACY_PLAN_ALIASES = {
  starter: "essential",
  professional: "growth",
  enterprise: "premium",
} as const;

const NON_RECURRING_ALLOWED_PLAN_INPUTS = [
  "paperless_transition",
] as const;

const RECURRING_ENTITLEMENT_PLAN_INPUTS = new Set<string>(
  RECURRING_ENTITLEMENT_PLAN_SLUGS
);
const LEGACY_ENTITLEMENT_PLAN_INPUTS = new Set<string>(
  Object.keys(LEGACY_PLAN_ALIASES)
);
const NON_RECURRING_ENTITLEMENT_PLAN_INPUTS = new Set<string>(
  NON_RECURRING_ALLOWED_PLAN_INPUTS
);

export type RecurringEntitlementPlanSlug =
  (typeof RECURRING_ENTITLEMENT_PLAN_SLUGS)[number];
export type CanonicalEntitlementPlanSlug =
  | RecurringEntitlementPlanSlug
  | (typeof NON_RECURRING_ALLOWED_PLAN_INPUTS)[number];
export type PlanEntitlementTier = "ESSENTIAL" | "CORE" | "SCALE";

export type PlanEntitlements = {
  plan: RecurringEntitlementPlanSlug;
  tier: PlanEntitlementTier;
  demandLimitMonthly: number;
  emailAutomation: boolean;
  clioAutoUpdate: boolean;
  advancedSummaries: boolean;
};

export const PLAN_ENTITLEMENTS: Record<
  RecurringEntitlementPlanSlug,
  PlanEntitlements
> = {
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

function normalizePlanLabel(planSlug: string | null | undefined): string | null {
  if (typeof planSlug !== "string") {
    return null;
  }
  const normalized = planSlug.trim().toLowerCase().replace(/-/g, "_");
  return normalized || null;
}

export function isRecurringEntitlementPlanSlug(
  planSlug: string | null | undefined
): planSlug is RecurringEntitlementPlanSlug {
  return RECURRING_ENTITLEMENT_PLAN_INPUTS.has(String(planSlug ?? ""));
}

export function getCanonicalEntitlementPlanSlug(
  planSlug: string | null | undefined
): CanonicalEntitlementPlanSlug | null {
  const normalized = normalizePlanLabel(planSlug);
  if (!normalized) {
    return null;
  }
  if (RECURRING_ENTITLEMENT_PLAN_INPUTS.has(normalized)) {
    return normalized as RecurringEntitlementPlanSlug;
  }
  if (NON_RECURRING_ENTITLEMENT_PLAN_INPUTS.has(normalized)) {
    return normalized as CanonicalEntitlementPlanSlug;
  }
  if (LEGACY_ENTITLEMENT_PLAN_INPUTS.has(normalized)) {
    return LEGACY_PLAN_ALIASES[
      normalized as keyof typeof LEGACY_PLAN_ALIASES
    ];
  }
  throw new Error(
    `Invalid plan label for recurring entitlements: ${String(planSlug)}`
  );
}

export function getRecurringEntitlementPlanSlug(
  planSlug: string | null | undefined
): RecurringEntitlementPlanSlug | null {
  const normalizedPlan = getCanonicalEntitlementPlanSlug(planSlug);
  return normalizedPlan && isRecurringEntitlementPlanSlug(normalizedPlan)
    ? normalizedPlan
    : null;
}

export function getPlanEntitlements(
  planSlug: string | null | undefined
): PlanEntitlements | null {
  const recurringPlan = getRecurringEntitlementPlanSlug(planSlug);
  return recurringPlan ? PLAN_ENTITLEMENTS[recurringPlan] : null;
}
