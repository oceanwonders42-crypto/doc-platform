/**
 * Billing module — config, types, and placeholders for future billing.
 * No Stripe, no DB migrations, no auth changes.
 *
 * Future implementation notes:
 * - Stripe: create Products/Prices for each plan; store stripePriceId on config.
 * - Usage: persist document count per org/account per billing period; enforce in API or middleware.
 * - Webhooks: Stripe subscription created/updated/deleted → sync plan and period to DB.
 * - Overage: either Stripe metered billing or invoice line items from usage records.
 */

export {
  ESSENTIAL_PLAN_ID,
  GROWTH_PLAN_ID,
  PREMIUM_PLAN_ID,
  PAPERLESS_TRANSITION_SERVICE_ID,
  MONTHLY_PLANS,
  MONTHLY_PLAN_IDS,
  PAPERLESS_TRANSITION_SERVICE,
  getPlanById,
  getOverageCentsPerDocument,
  getIncludedDocumentsPerMonth,
  getPriceCentsPerMonth,
  getPaperlessTransitionService,
} from "./plans";

export type {
  MonthlyPlanId,
  OneTimeServiceId,
  PlanOrServiceId,
  MonthlyPlanBillingConfig,
  OneTimeServiceBillingConfig,
  SubscriptionContext,
  UsageCheckResult,
} from "./types";
