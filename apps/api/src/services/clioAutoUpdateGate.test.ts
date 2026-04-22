import assert from "node:assert/strict";

import {
  getClioAutoUpdateGateState,
  getPostRouteClioAutoUpdateGateSource,
  isLegacyClioSyncEnabled,
} from "./clioAutoUpdateGate";

async function main() {
  assert.equal(isLegacyClioSyncEnabled(["crm_sync"]), true);
  assert.equal(isLegacyClioSyncEnabled(["crm_push"]), false);
  assert.equal(isLegacyClioSyncEnabled(null), false);

  assert.equal(
    getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: true,
      legacyClioSyncEnabled: false,
    }),
    "entitlement"
  );
  assert.equal(
    getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: false,
      legacyClioSyncEnabled: true,
    }),
    "legacy_flag"
  );
  assert.equal(
    getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: false,
      legacyClioSyncEnabled: false,
    }),
    null
  );

  assert.deepEqual(
    getClioAutoUpdateGateState({
      plan: "growth",
      features: [],
    }),
    {
      clioAutoUpdateEntitled: true,
      legacyClioSyncEnabled: false,
      clioAutoUpdateGateSource: "entitlement",
    }
  );

  assert.deepEqual(
    getClioAutoUpdateGateState({
      plan: "essential",
      features: ["crm_sync"],
    }),
    {
      clioAutoUpdateEntitled: false,
      legacyClioSyncEnabled: true,
      clioAutoUpdateGateSource: "legacy_flag",
    }
  );

  assert.deepEqual(
    getClioAutoUpdateGateState({
      plan: "essential",
      features: [],
    }),
    {
      clioAutoUpdateEntitled: false,
      legacyClioSyncEnabled: false,
      clioAutoUpdateGateSource: null,
    }
  );

  console.log("clioAutoUpdateGate tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
