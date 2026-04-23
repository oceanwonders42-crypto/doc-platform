import { canUseClioAutoUpdate, canUseEmailAutomation } from "./planPolicy";
import { hasStoredFeatureValue, isEmailAutomationEnabled } from "./featureFlags";

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
};

type FeatureCompatibilityFlags = {
  insurance_extraction: boolean;
  court_extraction: boolean;
  demand_narratives: boolean;
  duplicates_detection: boolean;
  crm_push: boolean;
  case_insights: boolean;
};

export function getStoredCompatibilityFlags(
  firm: FeatureCompatibilityFirm
): FeatureCompatibilityFlags {
  return {
    insurance_extraction: hasStoredFeatureValue(firm.features, "insurance_extraction"),
    court_extraction: hasStoredFeatureValue(firm.features, "court_extraction"),
    demand_narratives: hasStoredFeatureValue(firm.features, "demand_narratives"),
    duplicates_detection: hasStoredFeatureValue(firm.features, "duplicates_detection"),
    crm_push: hasStoredFeatureValue(firm.features, "crm_push"),
    case_insights: hasStoredFeatureValue(firm.features, "case_insights"),
  };
}

export function isEmailAutomationAllowedForFirm(
  firm: FeatureCompatibilityFirm
): boolean {
  return isEmailAutomationEnabled() && canUseEmailAutomation(firm.plan);
}

export function composeFeatureCompatibilityState(
  firm: FeatureCompatibilityFirm,
  flags: FeatureCompatibilityFlags
): ComposedFeatures {
  return {
    ...flags,
    crm_sync: canUseClioAutoUpdate(firm.plan),
    email_automation: isEmailAutomationAllowedForFirm(firm),
  };
}

export async function getComposedFeatures(
  firm: FeatureCompatibilityFirm
): Promise<ComposedFeatures> {
  return composeFeatureCompatibilityState(firm, getStoredCompatibilityFlags(firm));
}
