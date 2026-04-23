import { canUseClioAutoUpdate, canUseEmailAutomation } from "./planPolicy";
import {
  getClioAutoUpdateGateState,
  type ClioAutoUpdateGateSource,
} from "./clioAutoUpdateGate";
import { hasFeature, isEmailAutomationEnabled } from "./featureFlags";

export type FeatureCompatibilityFirm = {
  id: string;
  plan: string | null | undefined;
  features?: unknown;
};

export type ComposedFeatures = {
  insurance_extraction: boolean;
  court_extraction: boolean;
  demand_narratives: boolean;
  duplicates_detection: boolean;
  crm_sync: boolean;
  crm_push: boolean;
  case_insights: boolean;
  email_automation: boolean;
  clio_auto_update_entitled: boolean;
  legacy_clio_sync_enabled: boolean;
  clio_auto_update_gate_source: ClioAutoUpdateGateSource;
};

type FeatureCompatibilityFlags = {
  insurance_extraction: boolean;
  court_extraction: boolean;
  demand_narratives: boolean;
  duplicates_detection: boolean;
  crm_push: boolean;
  case_insights: boolean;
};

export function isEmailAutomationAllowedForFirm(
  firm: FeatureCompatibilityFirm
): boolean {
  return isEmailAutomationEnabled() && canUseEmailAutomation(firm.plan);
}

export function composeFeatureCompatibilityState(
  firm: FeatureCompatibilityFirm,
  flags: FeatureCompatibilityFlags
): ComposedFeatures {
  const crm_sync = canUseClioAutoUpdate(firm.plan);
  const clioAutoUpdateGate = getClioAutoUpdateGateState({
    plan: firm.plan,
    features: firm.features,
  });

  return {
    ...flags,
    crm_sync,
    email_automation: isEmailAutomationAllowedForFirm(firm),
    clio_auto_update_entitled: clioAutoUpdateGate.clioAutoUpdateEntitled,
    legacy_clio_sync_enabled: clioAutoUpdateGate.legacyClioSyncEnabled,
    clio_auto_update_gate_source: clioAutoUpdateGate.clioAutoUpdateGateSource,
  };
}

export async function getComposedFeatures(
  firm: FeatureCompatibilityFirm
): Promise<ComposedFeatures> {
  const [
    insurance_extraction,
    court_extraction,
    demand_narratives,
    duplicates_detection,
    crm_push,
    case_insights,
  ] = await Promise.all([
    hasFeature(firm.id, "insurance_extraction"),
    hasFeature(firm.id, "court_extraction"),
    hasFeature(firm.id, "demand_narratives"),
    hasFeature(firm.id, "duplicates_detection"),
    hasFeature(firm.id, "crm_push"),
    hasFeature(firm.id, "case_insights"),
  ]);

  return composeFeatureCompatibilityState(firm, {
    insurance_extraction,
    court_extraction,
    demand_narratives,
    duplicates_detection,
    crm_push,
    case_insights,
  });
}
