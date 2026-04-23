import assert from "node:assert/strict";

import { getClioAutoUpdateUiState } from "./clioAutoUpdateUi";

async function main() {
  const entitlementState = getClioAutoUpdateUiState("entitlement");
  assert.equal(entitlementState.badgeLabel, "Auto-update active");
  assert.equal(entitlementState.showPageBanner, false);
  assert.equal(entitlementState.showUpgradeCta, false);

  const legacyState = getClioAutoUpdateUiState("legacy_flag");
  assert.equal(
    legacyState.badgeLabel,
    "Legacy auto-update enabled (migration pending)"
  );
  assert.equal(legacyState.showPageBanner, false);
  assert.equal(legacyState.showUpgradeCta, false);

  const disabledState = getClioAutoUpdateUiState(null);
  assert.equal(
    disabledState.pageBannerTitle,
    "Automatic Clio updates are not enabled on your plan"
  );
  assert.equal(disabledState.showPageBanner, true);
  assert.equal(disabledState.upgradeCtaLabel, "Upgrade to enable");
  assert.equal(disabledState.showUpgradeCta, true);

  console.log("clioAutoUpdateUi tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
