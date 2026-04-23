import assert from "node:assert/strict";

import { composeFeatureCompatibilityState } from "./featureCompatibility";
import {
  applyEffectiveFeatureEntries,
  buildEffectiveFeatureAccessEntries,
  doOverrideWindowsOverlap,
  getDefaultFeatureAccessValues,
  isOverrideActiveNow,
  type FirmFeatureOverrideRecord,
} from "./firmFeatureOverrides";

function makeOverride(
  input: Partial<FirmFeatureOverrideRecord> &
    Pick<FirmFeatureOverrideRecord, "featureKey" | "enabled">
): FirmFeatureOverrideRecord {
  return {
    id: input.id ?? `override-${input.featureKey}`,
    firmId: input.firmId ?? "firm-test",
    featureKey: input.featureKey,
    enabled: input.enabled,
    isActive: input.isActive ?? true,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    reason: input.reason ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: input.createdAt ?? new Date("2026-04-22T12:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-04-22T12:00:00.000Z"),
  };
}

async function main() {
  const sharedFlags = {
    insurance_extraction: false,
    court_extraction: false,
    demand_narratives: false,
    duplicates_detection: false,
    crm_push: false,
    case_insights: false,
  };

  const now = new Date("2026-04-22T12:00:00.000Z");

  assert.equal(
    isOverrideActiveNow(
      makeOverride({
        featureKey: "case_insights",
        enabled: true,
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
      now
    ),
    true
  );

  assert.equal(
    isOverrideActiveNow(
      makeOverride({
        featureKey: "case_insights",
        enabled: true,
        endsAt: new Date("2026-04-21T23:59:59.000Z"),
      }),
      now
    ),
    false
  );

  assert.equal(
    doOverrideWindowsOverlap(
      {
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        startsAt: new Date("2026-04-15T00:00:00.000Z"),
        endsAt: new Date("2026-05-15T00:00:00.000Z"),
      }
    ),
    true
  );
  assert.equal(
    doOverrideWindowsOverlap(
      {
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        startsAt: new Date("2026-05-01T00:00:00.000Z"),
        endsAt: new Date("2026-06-01T00:00:00.000Z"),
      }
    ),
    false
  );

  const planOnlyFirm = {
    id: "firm-plan-only",
    plan: "growth",
    features: [],
  };
  const planOnlyBase = composeFeatureCompatibilityState(planOnlyFirm, sharedFlags);
  const planOnlyEntries = buildEffectiveFeatureAccessEntries(
    getDefaultFeatureAccessValues(planOnlyFirm, planOnlyBase),
    [],
    now
  );
  const crmSyncPlanOnly = planOnlyEntries.find((entry) => entry.featureKey === "crm_sync");
  assert.equal(crmSyncPlanOnly?.effectiveEnabled, true);
  assert.equal(crmSyncPlanOnly?.source, "entitlement");

  const overrideOnlyFirm = {
    id: "firm-override-only",
    plan: "essential",
    features: [],
  };
  const overrideOnlyBase = composeFeatureCompatibilityState(overrideOnlyFirm, sharedFlags);
  const overrideOnlyEntries = buildEffectiveFeatureAccessEntries(
    getDefaultFeatureAccessValues(overrideOnlyFirm, overrideOnlyBase),
    [
      makeOverride({
        featureKey: "case_insights",
        enabled: true,
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ],
    now
  );
  const overrideOnlyCaseInsights = overrideOnlyEntries.find(
    (entry) => entry.featureKey === "case_insights"
  );
  assert.equal(overrideOnlyCaseInsights?.effectiveEnabled, true);
  assert.equal(overrideOnlyCaseInsights?.source, "override");
  assert.equal(overrideOnlyCaseInsights?.planEnabled, false);

  const overrideBeatsPlanFirm = {
    id: "firm-override-beats-plan",
    plan: "growth",
    features: [],
  };
  const overrideBeatsPlanBase = composeFeatureCompatibilityState(
    overrideBeatsPlanFirm,
    sharedFlags
  );
  const overrideBeatsPlanEntries = buildEffectiveFeatureAccessEntries(
    getDefaultFeatureAccessValues(overrideBeatsPlanFirm, overrideBeatsPlanBase),
    [
      makeOverride({
        featureKey: "crm_sync",
        enabled: false,
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ],
    now
  );
  const overrideBeatsPlanCrmSync = overrideBeatsPlanEntries.find(
    (entry) => entry.featureKey === "crm_sync"
  );
  assert.equal(overrideBeatsPlanCrmSync?.effectiveEnabled, false);
  assert.equal(overrideBeatsPlanCrmSync?.source, "override");

  const expiredOverrideEntries = buildEffectiveFeatureAccessEntries(
    getDefaultFeatureAccessValues(overrideBeatsPlanFirm, overrideBeatsPlanBase),
    [
      makeOverride({
        featureKey: "crm_sync",
        enabled: false,
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: new Date("2026-04-10T00:00:00.000Z"),
      }),
    ],
    now
  );
  const expiredOverrideCrmSync = expiredOverrideEntries.find(
    (entry) => entry.featureKey === "crm_sync"
  );
  assert.equal(expiredOverrideCrmSync?.effectiveEnabled, true);
  assert.equal(expiredOverrideCrmSync?.source, "entitlement");
  assert.equal(expiredOverrideCrmSync?.activeNow, false);

  const legacyFallbackFirm = {
    id: "firm-legacy-fallback",
    plan: "essential",
    features: ["crm_sync"],
  };
  const legacyFallbackBase = composeFeatureCompatibilityState(
    legacyFallbackFirm,
    sharedFlags
  );
  const legacyFallbackEntries = buildEffectiveFeatureAccessEntries(
    getDefaultFeatureAccessValues(legacyFallbackFirm, legacyFallbackBase),
    [],
    now
  );
  const legacyFallbackCrmSync = legacyFallbackEntries.find(
    (entry) => entry.featureKey === "crm_sync"
  );
  assert.equal(legacyFallbackCrmSync?.effectiveEnabled, true);
  assert.equal(legacyFallbackCrmSync?.source, "legacy_flag");
  assert.equal(legacyFallbackCrmSync?.planEnabled, false);

  const originalEmailEnv = process.env.EMAIL_AUTOMATION_ENABLED;
  process.env.EMAIL_AUTOMATION_ENABLED = "false";
  try {
    const emailOverrideFirm = {
      id: "firm-email-override",
      plan: "essential",
      features: [],
    };
    const emailOverrideBase = composeFeatureCompatibilityState(
      emailOverrideFirm,
      sharedFlags
    );
    const emailOverrideEntries = buildEffectiveFeatureAccessEntries(
      getDefaultFeatureAccessValues(emailOverrideFirm, emailOverrideBase),
      [
        makeOverride({
          featureKey: "email_automation",
          enabled: true,
          startsAt: new Date("2026-04-01T00:00:00.000Z"),
          endsAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
      ],
      now
    );
    const emailOverride = emailOverrideEntries.find(
      (entry) => entry.featureKey === "email_automation"
    );
    assert.equal(emailOverride?.effectiveEnabled, false);
    assert.equal(emailOverride?.source, "none");
    assert.equal(emailOverride?.planEnabled, false);
  } finally {
    if (originalEmailEnv == null) {
      delete process.env.EMAIL_AUTOMATION_ENABLED;
    } else {
      process.env.EMAIL_AUTOMATION_ENABLED = originalEmailEnv;
    }
  }

  const applied = applyEffectiveFeatureEntries(planOnlyBase, planOnlyEntries);
  assert.equal(applied.crm_sync, true);
  assert.equal(applied.email_automation, planOnlyBase.email_automation);

  console.log("firmFeatureOverrides tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
