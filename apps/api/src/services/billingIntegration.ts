/**
 * Billing / subscription provider integration hook.
 * Firm has billingCustomerId and billingStatus; plan is stored on Firm.plan.
 * When a subscription provider (e.g. Stripe) is integrated:
 * - Create customer: set Firm.billingCustomerId
 * - Subscription created/updated: set Firm.plan, billingStatus = "active"
 * - Subscription cancelled: set Firm.billingStatus = "cancelled" or "past_due"
 * - Webhook handler should call applySubscriptionUpdate(firmId, { plan, billingStatus }).
 * No Stripe dependency in this file so the app runs without it; add stripe package and wire webhook when ready.
 */
import { prisma } from "../db/prisma";

export type SubscriptionUpdate = {
  plan?: string;
  billingStatus?: string;
  billingCustomerId?: string | null;
};

/**
 * Apply subscription update from payment provider (e.g. Stripe webhook).
 * Call this when subscription is created, updated, or cancelled.
 */
export async function applySubscriptionUpdate(
  firmId: string,
  update: SubscriptionUpdate
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (typeof update.plan === "string" && update.plan.trim()) data.plan = update.plan.trim();
  if (typeof update.billingStatus === "string" && update.billingStatus.trim()) data.billingStatus = update.billingStatus.trim();
  if (update.billingCustomerId !== undefined) data.billingCustomerId = update.billingCustomerId ?? null;
  if (Object.keys(data).length === 0) return;

  await prisma.firm.update({
    where: { id: firmId },
    data: data as { plan?: string; billingStatus?: string; billingCustomerId?: string | null },
  });
}

/**
 * Check if billing integration is configured (e.g. STRIPE_SECRET_KEY).
 * Used to gate webhook routes or customer creation.
 */
export function isBillingProviderConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_WEBHOOK_SECRET
  );
}
