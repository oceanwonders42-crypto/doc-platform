import assert from "node:assert/strict";

import {
  canUseAdvancedSummaries,
  canUseClioAutoUpdate,
  canUseEmailAutomation,
  getCanonicalPolicyPlanSlug,
  getCanonicalRecurringPolicyPlanSlug,
  getDemandMonthlyCap,
  getRecurringPlanEntitlements,
  hasRecurringPlanEntitlements,
} from "./planPolicy";

async function main() {
  assert.equal(getCanonicalPolicyPlanSlug("essential"), "essential");
  assert.equal(getCanonicalPolicyPlanSlug("growth"), "growth");
  assert.equal(getCanonicalPolicyPlanSlug("premium"), "premium");
  assert.equal(getCanonicalPolicyPlanSlug("paperless_transition"), "paperless_transition");

  assert.equal(
    getCanonicalPolicyPlanSlug("starter"),
    "essential",
    "legacy starter should continue to resolve through billing normalization"
  );
  assert.equal(
    getCanonicalPolicyPlanSlug("professional"),
    "growth",
    "legacy professional should continue to resolve through billing normalization"
  );
  assert.equal(
    getCanonicalPolicyPlanSlug("enterprise"),
    "premium",
    "legacy enterprise should continue to resolve through billing normalization"
  );

  assert.equal(
    getCanonicalPolicyPlanSlug("core"),
    null,
    "marketing labels must fail closed instead of resolving as runtime plan slugs"
  );
  assert.equal(getCanonicalPolicyPlanSlug("scale"), null);
  assert.equal(getCanonicalPolicyPlanSlug("custom"), null);
  assert.equal(getCanonicalPolicyPlanSlug(null), null);

  assert.equal(getCanonicalRecurringPolicyPlanSlug("essential"), "essential");
  assert.equal(getCanonicalRecurringPolicyPlanSlug("growth"), "growth");
  assert.equal(getCanonicalRecurringPolicyPlanSlug("premium"), "premium");
  assert.equal(getCanonicalRecurringPolicyPlanSlug("enterprise"), "premium");
  assert.equal(
    getCanonicalRecurringPolicyPlanSlug("paperless_transition"),
    null,
    "paperless transition stays outside recurring entitlements"
  );
  assert.equal(getCanonicalRecurringPolicyPlanSlug("core"), null);

  assert.equal(hasRecurringPlanEntitlements("essential"), true);
  assert.equal(hasRecurringPlanEntitlements("growth"), true);
  assert.equal(hasRecurringPlanEntitlements("premium"), true);
  assert.equal(hasRecurringPlanEntitlements("enterprise"), true);
  assert.equal(hasRecurringPlanEntitlements("paperless_transition"), false);
  assert.equal(hasRecurringPlanEntitlements("core"), false);

  assert.deepEqual(getRecurringPlanEntitlements("essential"), {
    plan: "essential",
    tier: "ESSENTIAL",
    demandLimitMonthly: 3,
    emailAutomation: false,
    clioAutoUpdate: false,
    advancedSummaries: false,
  });
  assert.deepEqual(getRecurringPlanEntitlements("growth"), {
    plan: "growth",
    tier: "CORE",
    demandLimitMonthly: 15,
    emailAutomation: true,
    clioAutoUpdate: true,
    advancedSummaries: false,
  });
  assert.deepEqual(getRecurringPlanEntitlements("premium"), {
    plan: "premium",
    tier: "SCALE",
    demandLimitMonthly: 30,
    emailAutomation: true,
    clioAutoUpdate: true,
    advancedSummaries: true,
  });
  assert.equal(getRecurringPlanEntitlements("core"), null);

  assert.equal(getDemandMonthlyCap("essential"), 3);
  assert.equal(getDemandMonthlyCap("growth"), 15);
  assert.equal(getDemandMonthlyCap("premium"), 30);
  assert.equal(getDemandMonthlyCap("paperless_transition"), null);
  assert.equal(getDemandMonthlyCap("scale"), null);

  assert.equal(canUseEmailAutomation("essential"), false);
  assert.equal(canUseEmailAutomation("growth"), true);
  assert.equal(canUseEmailAutomation("premium"), true);
  assert.equal(canUseEmailAutomation("core"), false);

  assert.equal(canUseClioAutoUpdate("essential"), false);
  assert.equal(canUseClioAutoUpdate("growth"), true);
  assert.equal(canUseClioAutoUpdate("premium"), true);
  assert.equal(canUseClioAutoUpdate("scale"), false);

  assert.equal(canUseAdvancedSummaries("essential"), false);
  assert.equal(canUseAdvancedSummaries("growth"), false);
  assert.equal(canUseAdvancedSummaries("premium"), true);
  assert.equal(canUseAdvancedSummaries("enterprise"), true);
  assert.equal(canUseAdvancedSummaries("core"), false);

  console.log("plan policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
