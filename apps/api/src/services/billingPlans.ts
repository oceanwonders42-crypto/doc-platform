/**
 * Authoritative billing plan metadata and enforcement.
 * Essential, Growth, Premium (subscription doc limits + overage); Paperless Transition (one-time).
 * Website pricing and enforcement must stay in sync with these constants.
 * @see BILLING_ASSUMPTIONS.md for pricing parity and integration notes.
 */
import { prisma } from "../db/prisma";

export const PLAN_SLUGS = [
  "starter", // legacy, treated as essential
  "essential",
  "growth",
  "premium",
  "paperless_transition",
] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export type PlanMetadata = {
  slug: PlanSlug;
  name: string;
  /** Documents included per billing month (subscription plans). 0 = not applicable (e.g. one-time). */
  docLimitMonthly: number;
  /** Overage price per document in dollars (e.g. 0.20). */
  overagePerDocDollars: number;
  /** Monthly price in dollars (0 for one-time or legacy). */
  priceMonthlyDollars: number;
  /** One-time price in dollars (e.g. 3500 for Paperless Transition). */
  priceOneTimeDollars: number | null;
};

/** Source of truth for pricing — must match marketing site. */
export const PLAN_METADATA: Record<string, PlanMetadata> = {
  starter: {
    slug: "starter",
    name: "Starter",
    docLimitMonthly: 1500,
    overagePerDocDollars: 0.2,
    priceMonthlyDollars: 499,
    priceOneTimeDollars: null,
  },
  essential: {
    slug: "essential",
    name: "Essential",
    docLimitMonthly: 1500,
    overagePerDocDollars: 0.2,
    priceMonthlyDollars: 499,
    priceOneTimeDollars: null,
  },
  growth: {
    slug: "growth",
    name: "Growth",
    docLimitMonthly: 4000,
    overagePerDocDollars: 0.15,
    priceMonthlyDollars: 999,
    priceOneTimeDollars: null,
  },
  premium: {
    slug: "premium",
    name: "Premium",
    docLimitMonthly: 10000,
    overagePerDocDollars: 0.1,
    priceMonthlyDollars: 1999,
    priceOneTimeDollars: null,
  },
  paperless_transition: {
    slug: "paperless_transition",
    name: "Paperless Transition",
    docLimitMonthly: 0, // one-time product; no monthly doc limit enforced here (or set high cap if desired)
    overagePerDocDollars: 0,
    priceMonthlyDollars: 0,
    priceOneTimeDollars: 3500,
  },
};

export function getPlanMetadata(planSlug: string): PlanMetadata | null {
  const normalized = planSlug?.toLowerCase().replace(/-/g, "_").trim() || "starter";
  return PLAN_METADATA[normalized] ?? PLAN_METADATA.starter ?? null;
}

/** Effective document limit for the firm: settings override or plan default. */
export async function getDocLimitForFirm(firmId: string): Promise<number> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { plan: true, settings: true },
  });
  if (!firm) return 0;
  const settings = (firm.settings as Record<string, unknown>) ?? {};
  const override = settings.documentLimitMonthly;
  if (typeof override === "number" && override >= 0) return Math.floor(override);
  const meta = getPlanMetadata(firm.plan);
  if (!meta) return 0;
  return meta.docLimitMonthly;
}

export type CanIngestResult =
  | { allowed: true; currentDocs: number; limit: number }
  | { allowed: false; currentDocs: number; limit: number; error: string };

/** Check if firm can ingest one more document this billing period (doc-based limit). */
export async function canIngestDocument(firmId: string): Promise<CanIngestResult> {
  const limit = await getDocLimitForFirm(firmId);
  if (limit <= 0) return { allowed: true, currentDocs: 0, limit: 0 }; // unlimited or one-time plan

  const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const row = await prisma.usageMonthly.findUnique({
    where: { firmId_yearMonth: { firmId, yearMonth: ym } },
    select: { docsProcessed: true },
  });
  const currentDocs = row?.docsProcessed ?? 0;
  if (currentDocs >= limit) {
    return {
      allowed: false,
      currentDocs,
      limit,
      error: "Monthly document limit exceeded",
    };
  }
  return { allowed: true, currentDocs, limit };
}

export type UsageForPeriod = {
  yearMonth: string;
  docsProcessed: number;
  pagesProcessed: number;
  insuranceDocsExtracted: number;
  courtDocsExtracted: number;
  narrativeGenerated: number;
  duplicateDetected: number;
};

export async function getUsageForPeriod(
  firmId: string,
  yearMonth: string
): Promise<UsageForPeriod | null> {
  const row = await prisma.usageMonthly.findUnique({
    where: { firmId_yearMonth: { firmId, yearMonth } },
    select: {
      yearMonth: true,
      docsProcessed: true,
      pagesProcessed: true,
      insuranceDocsExtracted: true,
      courtDocsExtracted: true,
      narrativeGenerated: true,
      duplicateDetected: true,
    },
  });
  if (!row) return null;
  return {
    yearMonth: row.yearMonth,
    docsProcessed: row.docsProcessed,
    pagesProcessed: row.pagesProcessed,
    insuranceDocsExtracted: row.insuranceDocsExtracted,
    courtDocsExtracted: row.courtDocsExtracted,
    narrativeGenerated: row.narrativeGenerated,
    duplicateDetected: row.duplicateDetected,
  };
}

export type OverageResult = {
  yearMonth: string;
  docLimit: number;
  docsProcessed: number;
  overageDocs: number;
  overagePerDocDollars: number;
  overageDollars: number;
  overageCents: number;
};

/** Compute overage for a billing period (subscription plans only). */
export async function getOverageForPeriod(
  firmId: string,
  yearMonth: string
): Promise<OverageResult | null> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { plan: true, settings: true },
  });
  if (!firm) return null;
  const limit = await getDocLimitForFirm(firmId);
  const meta = getPlanMetadata(firm.plan);
  if (!meta || meta.docLimitMonthly <= 0) {
    return {
      yearMonth,
      docLimit: limit,
      docsProcessed: 0,
      overageDocs: 0,
      overagePerDocDollars: 0,
      overageDollars: 0,
      overageCents: 0,
    };
  }
  const usage = await getUsageForPeriod(firmId, yearMonth);
  const docsProcessed = usage?.docsProcessed ?? 0;
  const overageDocs = Math.max(0, docsProcessed - limit);
  const overageDollars = overageDocs * meta.overagePerDocDollars;
  return {
    yearMonth,
    docLimit: limit,
    docsProcessed,
    overageDocs,
    overagePerDocDollars: meta.overagePerDocDollars,
    overageDollars,
    overageCents: Math.round(overageDollars * 100),
  };
}

/** All plans for admin/website parity (read-only). */
export function listPlansForDisplay(): PlanMetadata[] {
  return [PLAN_METADATA.essential, PLAN_METADATA.growth, PLAN_METADATA.premium, PLAN_METADATA.paperless_transition];
}
