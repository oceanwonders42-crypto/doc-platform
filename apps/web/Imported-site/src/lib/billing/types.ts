/**
 * Billing plan and service type definitions.
 * Used by billing config and future subscription/usage enforcement.
 * No payment provider or DB types here — structure only.
 */

/** Canonical IDs for monthly subscription plans. Use these in code, not display names. */
export type MonthlyPlanId = "essential" | "growth" | "premium";

/** Canonical ID for one-time services. */
export type OneTimeServiceId = "paperless_transition";

/** Metadata for a monthly plan used by billing logic (limits, rates). */
export interface MonthlyPlanBillingConfig {
  id: MonthlyPlanId;
  name: string;
  /** Price in USD cents per month (e.g. 49900 = $499). */
  priceCentsPerMonth: number;
  /** Included documents per billing period (month). */
  includedDocumentsPerMonth: number;
  /** Overage charge per document in USD cents (e.g. 20 = $0.20). */
  overageCentsPerDocument: number;
  /** Display label for support tier (e.g. "Email", "Priority", "VIP"). */
  supportTier: string;
  // TODO: add stripePriceId when integrating Stripe
  // stripePriceId?: string;
}

/** Metadata for a one-time service (e.g. Paperless Transition). */
export interface OneTimeServiceBillingConfig {
  id: OneTimeServiceId;
  name: string;
  /** Starting price in USD cents (e.g. 350000 = $3,500). */
  startingPriceCents: number;
  /** Display label (e.g. "Starting at $3,500"). */
  priceLabel: string;
  // TODO: add stripeProductId / stripePriceId when integrating Stripe
  // stripeProductId?: string;
  // stripePriceId?: string;
}

/** Union of all plan/service IDs for type-safe lookups. */
export type PlanOrServiceId = MonthlyPlanId | OneTimeServiceId;

/**
 * Placeholder for future subscription context (e.g. from DB or session).
 * Billing enforcement will use this to check limits and overage.
 */
export interface SubscriptionContext {
  planId: MonthlyPlanId;
  /** Period start (e.g. start of current month). TODO: from Stripe subscription or DB. */
  periodStart: Date;
  /** Period end. TODO: from Stripe subscription or DB. */
  periodEnd: Date;
  // TODO: stripeSubscriptionId?: string;
  // TODO: stripeCustomerId?: string;
}

/**
 * Result of a usage check. Future enforcement will return this from a usage service.
 */
export interface UsageCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  planId: MonthlyPlanId;
  /** Overage documents if over limit. */
  overageCount?: number;
  /** Estimated overage charge in cents if applicable. */
  overageCents?: number;
}
