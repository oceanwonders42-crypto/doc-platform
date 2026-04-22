import assert from "node:assert/strict";

import { normalizePlanSlug } from "./billingPlans";
import {
  PLAN_ENTITLEMENTS,
  RECURRING_ENTITLEMENT_PLAN_SLUGS,
  getPlanEntitlements,
  getRecurringEntitlementPlanSlug,
} from "./planEntitlements";

async function main() {
  assert.deepEqual(
    RECURRING_ENTITLEMENT_PLAN_SLUGS,
    ["essential", "growth", "premium"],
    "only recurring persisted plan slugs should carry recurring entitlements"
  );

  assert.deepEqual(
    Object.keys(PLAN_ENTITLEMENTS).sort(),
    ["essential", "growth", "premium"],
    "entitlement source should not expose alias or legacy keys"
  );

  assert.equal(getRecurringEntitlementPlanSlug("essential"), "essential");
  assert.equal(getRecurringEntitlementPlanSlug("growth"), "growth");
  assert.equal(getRecurringEntitlementPlanSlug("premium"), "premium");
  assert.equal(getRecurringEntitlementPlanSlug("starter"), "essential");
  assert.equal(getRecurringEntitlementPlanSlug("professional"), "growth");

  assert.equal(
    normalizePlanSlug("enterprise"),
    "premium",
    "legacy enterprise input should continue to normalize through existing billing logic"
  );
  assert.equal(
    getRecurringEntitlementPlanSlug("enterprise"),
    "premium",
    "enterprise should resolve only through existing normalization and never as its own key"
  );
  assert.throws(
    () => getRecurringEntitlementPlanSlug("core"),
    /Invalid plan label/,
    "marketing tier labels must fail closed"
  );
  assert.throws(() => getRecurringEntitlementPlanSlug("scale"), /Invalid plan label/);
  assert.throws(() => getRecurringEntitlementPlanSlug("custom"), /Invalid plan label/);

  assert.deepEqual(getPlanEntitlements("essential"), {
    plan: "essential",
    tier: "ESSENTIAL",
    demandLimitMonthly: 3,
    emailAutomation: false,
    clioAutoUpdate: false,
    advancedSummaries: false,
  });
  assert.deepEqual(getPlanEntitlements("growth"), {
    plan: "growth",
    tier: "CORE",
    demandLimitMonthly: 15,
    emailAutomation: true,
    clioAutoUpdate: true,
    advancedSummaries: false,
  });
  assert.deepEqual(getPlanEntitlements("premium"), {
    plan: "premium",
    tier: "SCALE",
    demandLimitMonthly: 30,
    emailAutomation: true,
    clioAutoUpdate: true,
    advancedSummaries: true,
  });

  assert.equal(
    getPlanEntitlements("paperless_transition"),
    null,
    "paperless_transition should be excluded from recurring entitlements"
  );
  assert.throws(
    () => getPlanEntitlements("core"),
    /Invalid plan label/,
    "invalid plan labels must never collapse to recurring entitlements"
  );
  assert.equal(
    getRecurringEntitlementPlanSlug("paperless_transition"),
    null,
    "paperless_transition should not resolve to a recurring entitlement key"
  );

  console.log("plan entitlements tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
