/**
 * Premium analytics/reporting hook: record events for reporting and scale operations.
 * No-op when premium is not enabled. Enterprise can extend to persist to warehouse or external.
 */
import { hasPremiumWorkflow } from "./featureFlags";

export type PremiumEventType =
  | "bulk_route"
  | "bulk_unroute"
  | "workflow_config_change"
  | "bulk_exception_resolve";

export type PremiumEventPayload = Record<string, unknown>;

export async function recordPremiumEvent(
  firmId: string,
  eventType: PremiumEventType,
  payload: PremiumEventPayload
): Promise<void> {
  const enabled = await hasPremiumWorkflow(firmId);
  if (!enabled) return;
  try {
    // Hook: future persistence to PremiumAnalyticsEvent table or external pipeline
    if (process.env.NODE_ENV !== "test") {
      console.info("[premium_analytics]", { firmId, eventType, payload });
    }
  } catch (_) {
    // Do not fail the request if analytics recording fails
  }
}
