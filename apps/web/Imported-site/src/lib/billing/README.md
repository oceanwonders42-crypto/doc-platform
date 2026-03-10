# Billing module (placeholders only)

This folder holds **plan constants, types, and placeholders** for future billing. There is no Stripe, no checkout, no webhooks, and no subscription engine yet.

## Contents

- **`types.ts`** — Shared types: `MonthlyPlanId`, `MonthlyPlanBillingConfig`, `OneTimeServiceBillingConfig`, `SubscriptionContext`, `UsageCheckResult`.
- **`plans.ts`** — Single source of truth: plan IDs, monthly price (cents), included documents/month, overage cents/document, Paperless Transition service. Helper getters for future enforcement.
- **`index.ts`** — Re-exports for `import { ... } from '@/lib/billing'`.

## Plans (canonical)

| Plan     | Price/mo | Included docs | Overage/doc |
|----------|----------|----------------|-------------|
| Essential| $499     | 1,500          | $0.20       |
| Growth   | $999     | 4,000          | $0.15       |
| Premium  | $1,999   | 10,000         | $0.10       |

**Paperless Transition** — one-time, starting at $3,500.

## Notes for future Stripe / subscription implementation

1. **Products & prices**
   - Create one Stripe Product per monthly plan (Essential, Growth, Premium) and one for Paperless Transition.
   - Create recurring Prices for the three monthly plans; one-time Price for Paperless.
   - Store `stripePriceId` (and optionally `stripeProductId`) on the config in `plans.ts` or in env (e.g. `STRIPE_PRICE_ESSENTIAL`).

2. **Usage enforcement**
   - Persist document count per organization/account per billing period (DB table or Stripe subscription item usage).
   - Before processing documents: resolve current plan (from session/DB or Stripe subscription), read `getIncludedDocumentsPerMonth(planId)`, compare to current period usage; block or allow and optionally calculate overage.
   - Overage: either Stripe metered billing (report usage to Stripe) or aggregate usage and add line items at period end.

3. **Webhooks**
   - `customer.subscription.created` / `updated` — sync plan ID and period (current_period_start/end) to your DB for fast usage checks.
   - `customer.subscription.deleted` — revoke access or downgrade to free tier.

4. **Auth**
   - No auth changes required for these placeholders. When you add billing, link Stripe `customerId` to your user/org and store active plan + period in your DB or session.

5. **Marketing vs billing**
   - `src/lib/pricing-data.ts` is for marketing copy and UI. Optionally refactor it to import display values from `@/lib/billing` so numbers stay in sync (e.g. price, document limit, overage label).
