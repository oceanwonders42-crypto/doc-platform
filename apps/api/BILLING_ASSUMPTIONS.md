# Billing assumptions and integration

## Plan structure (source of truth: `apps/api/src/services/billingPlans.ts`)

| Plan | Price | Doc limit/month | Overage/doc |
|------|--------|------------------|-------------|
| Essential | $499/mo | 1,500 | $0.20 |
| Growth | $999/mo | 4,000 | $0.15 |
| Premium | $1,999/mo | 10,000 | $0.10 |
| Paperless Transition | $3,500 one-time | — | — |

- **Starter** is a legacy plan slug; treated as Essential (1,500 docs, $499, $0.20 overage).
- **Document limit** is enforced at ingest (doc count per billing month from `UsageMonthly.docsProcessed`).
- **Overage** is computed as `max(0, docsProcessed - docLimit) * overagePerDocDollars` for the period.
- **Firm.settings.documentLimitMonthly** overrides the plan default when set (e.g. via admin PATCH).

## Website pricing parity

Marketing/website pricing MUST match `PLAN_METADATA` in `billingPlans.ts`. Use:

- **GET /billing/plans** (STAFF) to expose plan list to the app.
- When copying prices to a static site, copy from `billingPlans.ts` so code and site stay in sync.

## Subscription / payment integration

- **Firm** has `billingCustomerId`, `billingStatus`, `plan`; no new tables required.
- **Hook:** `apps/api/src/services/billingIntegration.ts` exports `applySubscriptionUpdate(firmId, { plan, billingStatus?, billingCustomerId? })`. Call from your Stripe (or other) webhook when subscription is created/updated/cancelled.
- **Config:** Set `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` when ready; `isBillingProviderConfigured()` gates webhook registration.
- **Remaining work:** Implement Stripe customer creation, checkout session, and webhook handler that maps Stripe price/plan to our plan slug and calls `applySubscriptionUpdate`.

## Usage and overage APIs

- **GET /billing/status** — Current firm usage, document limit, overage for current month, plan metadata.
- **GET /admin/firms/:firmId/billing** — Platform admin: full usage, overage, plan, billingCustomerId.
- **PATCH /admin/firms/:firmId** — Update `plan`, `pageLimitMonthly`, `status`, or `documentLimitMonthly` (stored in `settings`).

## Enforcement

- **canIngestDocument(firmId)** is called before creating a document in:
  - POST /ingest, POST /me/ingest, POST /me/ingest/bulk
  - Case upload (export-packet)
  - `ingestDocumentFromBuffer` (email/integration ingest)
- When limit is exceeded, responses return **402** with `docsProcessed` and `documentLimitMonthly`.
