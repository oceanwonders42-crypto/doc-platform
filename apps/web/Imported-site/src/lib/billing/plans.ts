/**
 * Billing plan constants and service definitions.
 * Single source of truth for limits and rates. No Stripe, no DB, no auth changes.
 * TODO: When adding Stripe — attach stripePriceId to each plan and use these IDs for metered usage.
 */

import type {
  MonthlyPlanBillingConfig,
  MonthlyPlanId,
  OneTimeServiceBillingConfig,
} from "./types";

// ─── Plan IDs (use these in code, not display names) ────────────────────────

export const ESSENTIAL_PLAN_ID = "essential" satisfies MonthlyPlanId;
export const GROWTH_PLAN_ID = "growth" satisfies MonthlyPlanId;
export const PREMIUM_PLAN_ID = "premium" satisfies MonthlyPlanId;
export const PAPERLESS_TRANSITION_SERVICE_ID =
  "paperless_transition" as const;

// ─── Monthly plans: price, document limit, overage ───────────────────────────

export const MONTHLY_PLANS: Record<MonthlyPlanId, MonthlyPlanBillingConfig> = {
  essential: {
    id: "essential",
    name: "Essential",
    priceCentsPerMonth: 49900, // $499/mo
    includedDocumentsPerMonth: 1_500,
    overageCentsPerDocument: 20, // $0.20
    supportTier: "Email",
    // TODO(STRIPE): add stripePriceId when creating products in Stripe
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceCentsPerMonth: 99900, // $999/mo
    includedDocumentsPerMonth: 4_000,
    overageCentsPerDocument: 15, // $0.15
    supportTier: "Priority",
    // TODO(STRIPE): add stripePriceId
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceCentsPerMonth: 199900, // $1,999/mo
    includedDocumentsPerMonth: 10_000,
    overageCentsPerDocument: 10, // $0.10
    supportTier: "VIP",
    // TODO(STRIPE): add stripePriceId
  },
};

/** Ordered list of monthly plan IDs (ascending by price). */
export const MONTHLY_PLAN_IDS: MonthlyPlanId[] = [
  ESSENTIAL_PLAN_ID,
  GROWTH_PLAN_ID,
  PREMIUM_PLAN_ID,
];

// ─── One-time service: Paperless Transition ──────────────────────────────────

export const PAPERLESS_TRANSITION_SERVICE: OneTimeServiceBillingConfig = {
  id: "paperless_transition",
  name: "Paperless Transition",
  startingPriceCents: 350_000, // $3,500
  priceLabel: "Starting at $3,500",
  // TODO(STRIPE): add stripeProductId and stripePriceId for one-time payment
};

// ─── Helpers (placeholders for future billing enforcement) ───────────────────

/**
 * Get plan config by ID. Use for limits and overage in future enforcement.
 * TODO(BILLING): call from usage middleware or document-processing pipeline to enforce limits.
 */
export function getPlanById(planId: MonthlyPlanId): MonthlyPlanBillingConfig {
  return MONTHLY_PLANS[planId];
}

/**
 * Overage rate in cents per document. Use when calculating overage charges.
 * TODO(STRIPE): report overage usage to Stripe metered billing or add as line item.
 */
export function getOverageCentsPerDocument(
  planId: MonthlyPlanId
): number {
  return getPlanById(planId).overageCentsPerDocument;
}

/**
 * Included document count per month for the plan.
 * TODO(BILLING): compare against current period usage (from DB or Stripe) before allowing processing.
 */
export function getIncludedDocumentsPerMonth(
  planId: MonthlyPlanId
): number {
  return getPlanById(planId).includedDocumentsPerMonth;
}

/**
 * Price in USD cents per month.
 * TODO(STRIPE): map to Stripe Price for subscription creation/update.
 */
export function getPriceCentsPerMonth(planId: MonthlyPlanId): number {
  return getPlanById(planId).priceCentsPerMonth;
}

/**
 * Paperless Transition one-time service config.
 * TODO(STRIPE): use for one-time checkout or invoice; no recurring usage.
 */
export function getPaperlessTransitionService(): OneTimeServiceBillingConfig {
  return PAPERLESS_TRANSITION_SERVICE;
}
