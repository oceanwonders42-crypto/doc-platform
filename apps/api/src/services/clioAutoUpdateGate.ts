import { canUseClioAutoUpdate } from "./planPolicy";

export type ClioAutoUpdateGateSource = "entitlement" | "legacy_flag" | null;

export type ClioAutoUpdateGateState = {
  clioAutoUpdateEntitled: boolean;
  legacyClioSyncEnabled: boolean;
  clioAutoUpdateGateSource: ClioAutoUpdateGateSource;
};

export function isLegacyClioSyncEnabled(features: unknown): boolean {
  return Array.isArray(features) && features.includes("crm_sync");
}

export function getPostRouteClioAutoUpdateGateSource(options: {
  clioAutoUpdateEnabled: boolean;
  legacyClioSyncEnabled: boolean;
}): ClioAutoUpdateGateSource {
  if (options.clioAutoUpdateEnabled) {
    return "entitlement";
  }

  if (options.legacyClioSyncEnabled) {
    return "legacy_flag";
  }

  return null;
}

export function getClioAutoUpdateGateState(options: {
  plan: string | null | undefined;
  features: unknown;
}): ClioAutoUpdateGateState {
  const clioAutoUpdateEntitled = canUseClioAutoUpdate(options.plan);
  const legacyClioSyncEnabled = isLegacyClioSyncEnabled(options.features);

  return {
    clioAutoUpdateEntitled,
    legacyClioSyncEnabled,
    clioAutoUpdateGateSource: getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: clioAutoUpdateEntitled,
      legacyClioSyncEnabled,
    }),
  };
}
