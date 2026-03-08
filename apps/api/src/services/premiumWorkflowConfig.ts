/**
 * Premium workflow config: firm-specific overrides stored in Firm.settings.premiumWorkflow.
 * Used only when hasPremiumWorkflow(firmId) is true. Keeps custom logic modular.
 */
import { prisma } from "../db/prisma";

export type PremiumWorkflowConfig = {
  /** Override min confidence for auto-route (0–1). If set, used instead of RoutingRule.minAutoRouteConfidence. */
  minAutoRouteConfidenceOverride?: number | null;
  /** Max documents per bulk-route request (default 100, cap 500). */
  bulkRouteMaxPerRequest?: number | null;
  /** Optional: doc types to exclude from auto-route (e.g. ["miscellaneous"]). */
  autoRouteExcludeDocTypes?: string[] | null;
};

const DEFAULT_BULK_MAX = 100;
const CAP_BULK_MAX = 500;

export async function getWorkflowConfig(
  firmId: string
): Promise<PremiumWorkflowConfig | null> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  if (!firm?.settings || typeof firm.settings !== "object") return null;
  const s = firm.settings as Record<string, unknown>;
  const pw = s.premiumWorkflow;
  if (!pw || typeof pw !== "object") return null;
  return pw as PremiumWorkflowConfig;
}

export async function setWorkflowConfig(
  firmId: string,
  patch: Partial<PremiumWorkflowConfig>
): Promise<PremiumWorkflowConfig> {
  const current = await getWorkflowConfig(firmId);
  const merged: PremiumWorkflowConfig = {
    ...(current ?? {}),
    ...patch,
  };
  if (merged.minAutoRouteConfidenceOverride != null) {
    const v = Number(merged.minAutoRouteConfidenceOverride);
    merged.minAutoRouteConfidenceOverride =
      Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
  }
  if (merged.bulkRouteMaxPerRequest != null) {
    const v = Math.floor(Number(merged.bulkRouteMaxPerRequest));
    merged.bulkRouteMaxPerRequest = Math.min(
      CAP_BULK_MAX,
      Math.max(1, Number.isFinite(v) ? v : DEFAULT_BULK_MAX)
    );
  }
  const settings = (await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  }))?.settings as Record<string, unknown> | null;
  const next = { ...(settings ?? {}), premiumWorkflow: merged };
  await prisma.firm.update({
    where: { id: firmId },
    data: { settings: next as object },
  });
  return merged;
}

/** Effective min auto-route confidence: override if set, else null (caller uses RoutingRule value). */
export async function getEffectiveMinAutoRouteConfidence(
  firmId: string
): Promise<number | null> {
  const config = await getWorkflowConfig(firmId);
  if (!config || config.minAutoRouteConfidenceOverride == null) return null;
  const v = config.minAutoRouteConfidenceOverride;
  if (!Number.isFinite(v) || v < 0 || v > 1) return null;
  return v;
}

export function getBulkRouteLimit(config: PremiumWorkflowConfig | null): number {
  const v = config?.bulkRouteMaxPerRequest;
  if (v == null || !Number.isFinite(v)) return DEFAULT_BULK_MAX;
  return Math.min(CAP_BULK_MAX, Math.max(1, Math.floor(v)));
}
