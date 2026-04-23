import assert from "node:assert/strict";

import { composeFeatureCompatibilityState } from "./featureCompatibility";

async function main() {
  const sharedFlags = {
    insurance_extraction: false,
    court_extraction: false,
    demand_narratives: false,
    duplicates_detection: false,
    crm_push: false,
    case_insights: false,
  };

  const entitlementState = composeFeatureCompatibilityState(
    {
      id: "firm-entitlement",
      plan: "growth",
      features: [],
    },
    sharedFlags
  );
  assert.equal(entitlementState.crm_sync, true);
  assert.equal(entitlementState.clio_auto_update_entitled, true);
  assert.equal(entitlementState.legacy_clio_sync_enabled, false);
  assert.equal(entitlementState.clio_auto_update_gate_source, "entitlement");

  const legacyState = composeFeatureCompatibilityState(
    {
      id: "firm-legacy",
      plan: "essential",
      features: ["crm_sync"],
    },
    sharedFlags
  );
  assert.equal(legacyState.crm_sync, false);
  assert.equal(legacyState.clio_auto_update_entitled, false);
  assert.equal(legacyState.legacy_clio_sync_enabled, true);
  assert.equal(legacyState.clio_auto_update_gate_source, "legacy_flag");

  const disabledState = composeFeatureCompatibilityState(
    {
      id: "firm-disabled",
      plan: "essential",
      features: [],
    },
    sharedFlags
  );
  assert.equal(disabledState.crm_sync, false);
  assert.equal(disabledState.clio_auto_update_entitled, false);
  assert.equal(disabledState.legacy_clio_sync_enabled, false);
  assert.equal(disabledState.clio_auto_update_gate_source, null);

  console.log("featureCompatibility tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
