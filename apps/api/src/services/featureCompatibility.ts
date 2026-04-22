import { canUseEmailAutomation } from "./planPolicy";
import { hasFeature, isEmailAutomationEnabled } from "./featureFlags";

export type FeatureCompatibilityFirm = {
  id: string;
  plan: string | null | undefined;
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

export function isEmailAutomationAllowedForFirm(
  firm: FeatureCompatibilityFirm
): boolean {
  return isEmailAutomationEnabled() && canUseEmailAutomation(firm.plan);
}

export async function getComposedFeatures(
  firm: FeatureCompatibilityFirm
): Promise<ComposedFeatures> {
  const [
    insurance_extraction,
    court_extraction,
    demand_narratives,
    duplicates_detection,
    crm_sync,
    crm_push,
    case_insights,
  ] = await Promise.all([
    hasFeature(firm.id, "insurance_extraction"),
    hasFeature(firm.id, "court_extraction"),
    hasFeature(firm.id, "demand_narratives"),
    hasFeature(firm.id, "duplicates_detection"),
    hasFeature(firm.id, "crm_sync"),
    hasFeature(firm.id, "crm_push"),
    hasFeature(firm.id, "case_insights"),
  ]);

  return {
    insurance_extraction,
    court_extraction,
    demand_narratives,
    duplicates_detection,
    crm_sync,
    crm_push,
    case_insights,
    email_automation: isEmailAutomationAllowedForFirm(firm),
  };
}
