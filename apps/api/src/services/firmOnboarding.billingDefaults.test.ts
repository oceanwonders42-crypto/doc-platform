import assert from "node:assert/strict";
import crypto from "node:crypto";

import { prisma } from "../db/prisma";
import { getPlanMetadata } from "./billingPlans";
import { createFirmWithDefaults } from "./firmOnboarding";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const defaultFirmName = `Billing Default Firm ${suffix}`;
  const aliasFirmName = `Billing Alias Firm ${suffix}`;
  const expectedPlan = getPlanMetadata("essential");

  let defaultFirmId: string | null = null;
  let aliasFirmId: string | null = null;

  try {
    const defaultFirm = await createFirmWithDefaults({ name: defaultFirmName });
    defaultFirmId = defaultFirm.id;

    assert.equal(defaultFirm.plan, expectedPlan.slug, "new firms should default to the canonical essential plan");
    assert.equal(
      defaultFirm.pageLimitMonthly,
      expectedPlan.docLimitMonthly,
      "new firms should inherit the canonical essential document limit"
    );
    assert.equal(defaultFirm.billingStatus, "trial");

    const persistedDefaultFirm = await prisma.firm.findUnique({
      where: { id: defaultFirm.id },
      select: {
        plan: true,
        pageLimitMonthly: true,
        billingStatus: true,
      },
    });

    assert(persistedDefaultFirm, "expected default-created firm to persist");
    assert.equal(persistedDefaultFirm!.plan, expectedPlan.slug);
    assert.equal(persistedDefaultFirm!.pageLimitMonthly, expectedPlan.docLimitMonthly);
    assert.equal(persistedDefaultFirm!.billingStatus, "trial");

    const aliasFirm = await createFirmWithDefaults({ name: aliasFirmName, plan: "starter" });
    aliasFirmId = aliasFirm.id;

    assert.equal(aliasFirm.plan, expectedPlan.slug, "legacy starter input should normalize to essential");
    assert.equal(aliasFirm.pageLimitMonthly, expectedPlan.docLimitMonthly);

    const persistedAliasFirm = await prisma.firm.findUnique({
      where: { id: aliasFirm.id },
      select: {
        plan: true,
        pageLimitMonthly: true,
      },
    });

    assert(persistedAliasFirm, "expected alias-created firm to persist");
    assert.equal(persistedAliasFirm!.plan, expectedPlan.slug);
    assert.equal(persistedAliasFirm!.pageLimitMonthly, expectedPlan.docLimitMonthly);

    console.log("firm onboarding billing defaults test passed", {
      defaultPlan: expectedPlan.slug,
      defaultDocumentLimit: expectedPlan.docLimitMonthly,
      defaultFirmId,
      aliasFirmId,
    });
  } finally {
    if (aliasFirmId) {
      await prisma.routingRule.deleteMany({ where: { firmId: aliasFirmId } }).catch(() => {});
      await prisma.firm.deleteMany({ where: { id: aliasFirmId } }).catch(() => {});
    }
    if (defaultFirmId) {
      await prisma.routingRule.deleteMany({ where: { firmId: defaultFirmId } }).catch(() => {});
      await prisma.firm.deleteMany({ where: { id: defaultFirmId } }).catch(() => {});
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
