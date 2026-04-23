import type { FirmFeatureOverride } from "@prisma/client";

import { prisma } from "../db/prisma";
import { canUseClioAutoUpdate } from "./planPolicy";
import { isEmailAutomationEnabled } from "./featureFlags";
import {
  getComposedFeatures,
  type ComposedFeatures,
  type FeatureCompatibilityFirm,
} from "./featureCompatibility";

export const OVERRIDABLE_FEATURE_KEYS = [
  "insurance_extraction",
  "court_extraction",
  "demand_narratives",
  "duplicates_detection",
  "crm_sync",
  "crm_push",
  "case_insights",
  "email_automation",
] as const;

export type OverridableFeatureKey = (typeof OVERRIDABLE_FEATURE_KEYS)[number];
export type FeatureAccessSource =
  | "plan"
  | "override"
  | "none"
  | "entitlement"
  | "legacy_flag";
type CrmSyncGateSource = "entitlement" | "legacy_flag" | "none";
type FirmFeatureCompatibilityContext = FeatureCompatibilityFirm & { features?: unknown };

export type FirmFeatureOverrideRecord = Pick<
  FirmFeatureOverride,
  | "id"
  | "firmId"
  | "featureKey"
  | "enabled"
  | "isActive"
  | "startsAt"
  | "endsAt"
  | "reason"
  | "createdBy"
  | "createdAt"
  | "updatedAt"
>;

export type EffectiveFeatureAccessEntry = {
  featureKey: OverridableFeatureKey;
  effectiveEnabled: boolean;
  source: FeatureAccessSource;
  planEnabled: boolean;
  overrideId: string | null;
  overrideEnabled: boolean | null;
  startsAt: Date | null;
  endsAt: Date | null;
  activeNow: boolean;
  reason: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type DefaultFeatureAccessValue = {
  effectiveEnabled: boolean;
  planEnabled: boolean;
  source: Extract<FeatureAccessSource, "plan" | "none"> | CrmSyncGateSource;
};

const OVERRIDABLE_FEATURE_KEY_SET = new Set<string>(OVERRIDABLE_FEATURE_KEYS);

function compareOverrideRecency(
  left: FirmFeatureOverrideRecord,
  right: FirmFeatureOverrideRecord
): number {
  const updated = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updated !== 0) return updated;
  return right.createdAt.getTime() - left.createdAt.getTime();
}

function getRepresentativeOverride(
  overrides: FirmFeatureOverrideRecord[],
  featureKey: OverridableFeatureKey,
  at: Date
): FirmFeatureOverrideRecord | null {
  const matching = overrides
    .filter((override) => override.featureKey === featureKey)
    .sort(compareOverrideRecency);
  if (matching.length === 0) return null;

  const activeOverride = matching.find((override) => isOverrideActiveNow(override, at));
  return activeOverride ?? matching[0] ?? null;
}

function isLegacyClioSyncEnabled(features: unknown): boolean {
  return Array.isArray(features) && features.includes("crm_sync");
}

function getCrmSyncGateSource(
  firm: FirmFeatureCompatibilityContext
): CrmSyncGateSource {
  if (canUseClioAutoUpdate(firm.plan)) {
    return "entitlement";
  }
  if (isLegacyClioSyncEnabled(firm.features)) {
    return "legacy_flag";
  }
  return "none";
}

export function getDefaultFeatureAccessValues(
  firm: FirmFeatureCompatibilityContext,
  features: ComposedFeatures
): Record<OverridableFeatureKey, DefaultFeatureAccessValue> {
  const crmSyncSource = getCrmSyncGateSource(firm);

  return {
    insurance_extraction: {
      effectiveEnabled: features.insurance_extraction,
      planEnabled: features.insurance_extraction,
      source: features.insurance_extraction ? "plan" : "none",
    },
    court_extraction: {
      effectiveEnabled: features.court_extraction,
      planEnabled: features.court_extraction,
      source: features.court_extraction ? "plan" : "none",
    },
    demand_narratives: {
      effectiveEnabled: features.demand_narratives,
      planEnabled: features.demand_narratives,
      source: features.demand_narratives ? "plan" : "none",
    },
    duplicates_detection: {
      effectiveEnabled: features.duplicates_detection,
      planEnabled: features.duplicates_detection,
      source: features.duplicates_detection ? "plan" : "none",
    },
    crm_sync: {
      effectiveEnabled: crmSyncSource !== "none",
      planEnabled: crmSyncSource === "entitlement",
      source: crmSyncSource,
    },
    crm_push: {
      effectiveEnabled: features.crm_push,
      planEnabled: features.crm_push,
      source: features.crm_push ? "plan" : "none",
    },
    case_insights: {
      effectiveEnabled: features.case_insights,
      planEnabled: features.case_insights,
      source: features.case_insights ? "plan" : "none",
    },
    email_automation: {
      effectiveEnabled: features.email_automation,
      planEnabled: features.email_automation,
      source: features.email_automation ? "plan" : "none",
    },
  };
}

export function isOverridableFeatureKey(
  value: string | null | undefined
): value is OverridableFeatureKey {
  return typeof value === "string" && OVERRIDABLE_FEATURE_KEY_SET.has(value);
}

export function isOverrideActiveNow(
  override: Pick<FirmFeatureOverrideRecord, "isActive" | "startsAt" | "endsAt">,
  at = new Date()
): boolean {
  if (!override.isActive) return false;
  if (override.startsAt && override.startsAt.getTime() > at.getTime()) return false;
  if (override.endsAt && override.endsAt.getTime() <= at.getTime()) return false;
  return true;
}

export async function getFirmFeatureCompatibilityContext(
  firmId: string
): Promise<FirmFeatureCompatibilityContext | null> {
  return prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true, plan: true, features: true },
  });
}

export async function listFirmFeatureOverrides(
  firmId: string
): Promise<FirmFeatureOverrideRecord[]> {
  return prisma.firmFeatureOverride.findMany({
    where: { firmId },
    select: {
      id: true,
      firmId: true,
      featureKey: true,
      enabled: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      reason: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

export function doOverrideWindowsOverlap(
  left: Pick<FirmFeatureOverrideRecord, "startsAt" | "endsAt">,
  right: Pick<FirmFeatureOverrideRecord, "startsAt" | "endsAt">
): boolean {
  const leftStart = left.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const leftEnd = left.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightStart = right.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightEnd = right.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;

  return leftStart < rightEnd && rightStart < leftEnd;
}

export async function findOverlappingActiveFirmFeatureOverride(params: {
  firmId: string;
  featureKey: OverridableFeatureKey;
  startsAt: Date | null;
  endsAt: Date | null;
  excludeId?: string | null;
}): Promise<FirmFeatureOverrideRecord | null> {
  const candidates = await prisma.firmFeatureOverride.findMany({
    where: {
      firmId: params.firmId,
      featureKey: params.featureKey,
      isActive: true,
      ...(params.excludeId ? { NOT: { id: params.excludeId } } : {}),
    },
    select: {
      id: true,
      firmId: true,
      featureKey: true,
      enabled: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      reason: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return (
    candidates.find((candidate) =>
      doOverrideWindowsOverlap(
        { startsAt: params.startsAt, endsAt: params.endsAt },
        candidate
      )
    ) ?? null
  );
}

export function buildEffectiveFeatureAccessEntries(
  defaultValues: Record<OverridableFeatureKey, DefaultFeatureAccessValue>,
  overrides: FirmFeatureOverrideRecord[],
  at = new Date()
): EffectiveFeatureAccessEntry[] {
  return OVERRIDABLE_FEATURE_KEYS.map((featureKey) => {
    const defaultValue = defaultValues[featureKey];
    const override = getRepresentativeOverride(overrides, featureKey, at);
    const activeNow = override ? isOverrideActiveNow(override, at) : false;
    const overrideEnabled = override?.enabled ?? null;
    const effectiveEnabled = activeNow
      ? featureKey === "email_automation"
        ? Boolean(overrideEnabled) && isEmailAutomationEnabled()
        : Boolean(overrideEnabled)
      : defaultValue.effectiveEnabled;

    let source = (defaultValue.effectiveEnabled
      ? defaultValue.source
      : "none") as FeatureAccessSource;
    if (activeNow) {
      source =
        featureKey === "email_automation" &&
        Boolean(overrideEnabled) &&
        !isEmailAutomationEnabled()
          ? (defaultValue.effectiveEnabled ? defaultValue.source : "none")
          : "override";
    }

    return {
      featureKey,
      effectiveEnabled,
      source,
      planEnabled: defaultValue.planEnabled,
      overrideId: override?.id ?? null,
      overrideEnabled,
      startsAt: override?.startsAt ?? null,
      endsAt: override?.endsAt ?? null,
      activeNow,
      reason: override?.reason ?? null,
      createdBy: override?.createdBy ?? null,
      createdAt: override?.createdAt ?? null,
      updatedAt: override?.updatedAt ?? null,
    };
  });
}

export function applyEffectiveFeatureEntries(
  features: ComposedFeatures,
  entries: EffectiveFeatureAccessEntry[]
): ComposedFeatures {
  const nextFeatures: ComposedFeatures = { ...features };
  for (const entry of entries) {
    nextFeatures[entry.featureKey] = entry.effectiveEnabled;
  }
  return nextFeatures;
}

export async function getEffectiveFirmFeatures(
  firm: FirmFeatureCompatibilityContext,
  at = new Date()
): Promise<ComposedFeatures> {
  const { features, entries } = await getEffectiveFirmFeatureAccess(firm, at);
  return applyEffectiveFeatureEntries(features, entries);
}

export async function getEffectiveFirmFeatureAccess(
  firm: FirmFeatureCompatibilityContext,
  at = new Date()
): Promise<{
  features: ComposedFeatures;
  overrides: FirmFeatureOverrideRecord[];
  entries: EffectiveFeatureAccessEntry[];
}> {
  const [features, overrides] = await Promise.all([
    getComposedFeatures(firm),
    listFirmFeatureOverrides(firm.id),
  ]);
  const defaultValues = getDefaultFeatureAccessValues(firm, features);
  return {
    features,
    overrides,
    entries: buildEffectiveFeatureAccessEntries(defaultValues, overrides, at),
  };
}

export async function getEffectiveFeatureValue(
  firm: FirmFeatureCompatibilityContext,
  featureKey: OverridableFeatureKey,
  at = new Date()
): Promise<boolean> {
  const [features, overrides] = await Promise.all([
    getComposedFeatures(firm),
    listFirmFeatureOverrides(firm.id),
  ]);
  const entry = buildEffectiveFeatureAccessEntries(
    getDefaultFeatureAccessValues(firm, features),
    overrides,
    at
  ).find((candidate) => candidate.featureKey === featureKey);
  return entry?.effectiveEnabled ?? false;
}

export async function getEffectiveFeatureValueForFirmId(
  firmId: string,
  featureKey: OverridableFeatureKey,
  at = new Date()
): Promise<boolean> {
  const firm = await getFirmFeatureCompatibilityContext(firmId);
  if (!firm) return false;
  return getEffectiveFeatureValue(firm, featureKey, at);
}

export async function getFeatureAccessSource(
  firm: FirmFeatureCompatibilityContext,
  featureKey: OverridableFeatureKey,
  at = new Date()
): Promise<FeatureAccessSource> {
  const [features, overrides] = await Promise.all([
    getComposedFeatures(firm),
    listFirmFeatureOverrides(firm.id),
  ]);
  const entry = buildEffectiveFeatureAccessEntries(
    getDefaultFeatureAccessValues(firm, features),
    overrides,
    at
  ).find((candidate) => candidate.featureKey === featureKey);
  return entry?.source ?? "none";
}

export async function getFirmFeatureOverrideState(
  firmId: string,
  featureKey: OverridableFeatureKey,
  at = new Date()
): Promise<{
  activeOverride: FirmFeatureOverrideRecord | null;
  selectedOverride: FirmFeatureOverrideRecord | null;
  activeNow: boolean;
}> {
  const overrides = await listFirmFeatureOverrides(firmId);
  const selectedOverride = getRepresentativeOverride(overrides, featureKey, at);
  const activeOverride =
    selectedOverride && isOverrideActiveNow(selectedOverride, at)
      ? selectedOverride
      : null;

  return {
    activeOverride,
    selectedOverride,
    activeNow: activeOverride != null,
  };
}
