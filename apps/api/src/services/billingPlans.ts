/**
 * Authoritative billing plan metadata and usage enforcement.
 * Essential / Growth / Premium are the sellable recurring plans.
 * Paperless Transition remains a one-time legacy offer.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import { getFirmAiCostSummary, type AiCostEntitySummary } from "./aiTaskTelemetry";

const DEFAULT_WARNING_THRESHOLD_RATIO = 0.8;

const LEGACY_PLAN_ALIASES = {
  starter: "essential",
  professional: "growth",
  enterprise: "premium",
} as const;

export const PLAN_SLUGS = [
  "essential",
  "growth",
  "premium",
  "paperless_transition",
] as const;

export type CanonicalPlanSlug = (typeof PLAN_SLUGS)[number];
export type PlanSlug = CanonicalPlanSlug | keyof typeof LEGACY_PLAN_ALIASES;
export type UsageLimitStatus = "within_limit" | "warning" | "over_limit";

export type PlanMetadata = {
  slug: CanonicalPlanSlug;
  name: string;
  docLimitMonthly: number;
  overagePerDocDollars: number;
  aiIncludedMonthlyUsd: number;
  aiOveragePerUsdDollars: number;
  includedFirms: number;
  overagePerExtraFirmMonthlyDollars: number;
  priceMonthlyDollars: number;
  priceOneTimeDollars: number | null;
};

export type UsageLimitMeter = {
  included: number;
  used: number;
  remainingIncluded: number | null;
  warningThresholdRatio: number;
  warningAt: number | null;
  usageRatio: number | null;
  softCapReached: boolean;
  overageUnits: number;
  overageDollars: number;
  overageCents: number;
  status: UsageLimitStatus;
};

export type UsageForPeriod = {
  yearMonth: string;
  docsProcessed: number;
  pagesProcessed: number;
  insuranceDocsExtracted: number;
  courtDocsExtracted: number;
  narrativeGenerated: number;
  duplicateDetected: number;
  updatedAt: Date | null;
};

export type OverageResult = {
  yearMonth: string;
  docLimit: number;
  docsProcessed: number;
  overageDocs: number;
  overagePerDocDollars: number;
  overageDollars: number;
  overageCents: number;
};

export type CanIngestResult =
  | {
      allowed: true;
      currentDocs: number;
      limit: number;
      billingStatus: string;
      status: UsageLimitStatus;
      softCapReached: boolean;
      overageDocs: number;
      overageDollars: number;
    }
  | {
      allowed: false;
      currentDocs: number;
      limit: number;
      billingStatus: string;
      status: UsageLimitStatus;
      softCapReached: boolean;
      overageDocs: number;
      overageDollars: number;
      error: string;
    };

export type DocumentIngestPolicyContext = {
  billingStatus: string;
  trialEndsAt: Date | null;
  currentDocs: number;
  limit: number;
  meter: UsageLimitMeter;
};

export type FirmBillingUsageSnapshot = {
  period: {
    yearMonth: string;
    from: string;
    to: string;
  };
  firm: {
    id: string;
    name: string;
    rawPlan: string;
    plan: CanonicalPlanSlug;
    status: string;
    billingStatus: string;
    trialEndsAt: string | null;
    billingCustomerId: string | null;
    pageLimitMonthly: number;
    retentionDays: number;
  };
  plan: PlanMetadata & {
    documentLimitMonthly: number;
    aiIncludedMonthlyUsdEffective: number;
    aiOveragePerUsdDollarsEffective: number;
    includedFirmsEffective: number;
    overagePerExtraFirmMonthlyDollarsEffective: number;
  };
  usage: UsageForPeriod & {
    aiExecutedCostUsd: number;
    aiCacheSavedCostUsd: number;
    aiExecutedCount: number;
    aiCacheSavedCount: number;
    aiDedupeAvoidedCount: number;
    aiPromptTokens: number;
    aiCompletionTokens: number;
    aiTotalTokens: number;
    currentFirmCount: number;
  };
  enforcement: {
    documents: UsageLimitMeter;
    ai: UsageLimitMeter;
    firms: UsageLimitMeter;
    softCapReached: boolean;
    overageActive: boolean;
    totalOverageDollars: number;
    totalOverageCents: number;
  };
};

export const PLAN_METADATA: Record<CanonicalPlanSlug, PlanMetadata> = {
  essential: {
    slug: "essential",
    name: "Essential",
    docLimitMonthly: 1500,
    overagePerDocDollars: 0.2,
    aiIncludedMonthlyUsd: 25,
    aiOveragePerUsdDollars: 1.2,
    includedFirms: 1,
    overagePerExtraFirmMonthlyDollars: 499,
    priceMonthlyDollars: 499,
    priceOneTimeDollars: null,
  },
  growth: {
    slug: "growth",
    name: "Growth",
    docLimitMonthly: 4000,
    overagePerDocDollars: 0.15,
    aiIncludedMonthlyUsd: 100,
    aiOveragePerUsdDollars: 1.1,
    includedFirms: 2,
    overagePerExtraFirmMonthlyDollars: 399,
    priceMonthlyDollars: 999,
    priceOneTimeDollars: null,
  },
  premium: {
    slug: "premium",
    name: "Premium",
    docLimitMonthly: 10000,
    overagePerDocDollars: 0.1,
    aiIncludedMonthlyUsd: 300,
    aiOveragePerUsdDollars: 1,
    includedFirms: 5,
    overagePerExtraFirmMonthlyDollars: 299,
    priceMonthlyDollars: 1999,
    priceOneTimeDollars: null,
  },
  paperless_transition: {
    slug: "paperless_transition",
    name: "Paperless Transition",
    docLimitMonthly: 0,
    overagePerDocDollars: 0,
    aiIncludedMonthlyUsd: 0,
    aiOveragePerUsdDollars: 0,
    includedFirms: 1,
    overagePerExtraFirmMonthlyDollars: 0,
    priceMonthlyDollars: 0,
    priceOneTimeDollars: 3500,
  },
};

function roundUsd(value: number): number {
  return Number(value.toFixed(8));
}

function roundCount(value: number): number {
  return Number(value.toFixed(4));
}

function normalizePositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function readNumericSetting(settings: Prisma.JsonValue | null | undefined, key: string): number | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  return normalizePositiveNumber((settings as Record<string, unknown>)[key]);
}

export function normalizePlanSlug(planSlug: string | null | undefined): CanonicalPlanSlug {
  const normalized = typeof planSlug === "string" ? planSlug.trim().toLowerCase().replace(/-/g, "_") : "";
  const canonical = normalized in LEGACY_PLAN_ALIASES
    ? LEGACY_PLAN_ALIASES[normalized as keyof typeof LEGACY_PLAN_ALIASES]
    : normalized;
  return PLAN_METADATA[canonical as CanonicalPlanSlug]
    ? (canonical as CanonicalPlanSlug)
    : "essential";
}

export function getPlanMetadata(planSlug: string | null | undefined): PlanMetadata {
  return PLAN_METADATA[normalizePlanSlug(planSlug)];
}

export function getBillingPeriodYearMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getBillingPeriodRange(date = new Date()): { yearMonth: string; from: Date; to: Date } {
  const yearMonth = getBillingPeriodYearMonth(date);
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { yearMonth, from, to };
}

function resolveDocumentLimit(firm: {
  plan: string;
  settings: Prisma.JsonValue | null;
}): number {
  const override = readNumericSetting(firm.settings, "documentLimitMonthly");
  if (override != null) {
    return Math.floor(override);
  }
  return getPlanMetadata(firm.plan).docLimitMonthly;
}

function resolveAiIncludedMonthlyUsd(firm: {
  plan: string;
  settings: Prisma.JsonValue | null;
}): number {
  const override = readNumericSetting(firm.settings, "aiIncludedMonthlyUsd");
  return override != null ? roundUsd(override) : getPlanMetadata(firm.plan).aiIncludedMonthlyUsd;
}

function resolveAiOveragePerUsdDollars(firm: {
  plan: string;
  settings: Prisma.JsonValue | null;
}): number {
  const override = readNumericSetting(firm.settings, "aiOveragePerUsdDollars");
  return override != null ? roundUsd(override) : getPlanMetadata(firm.plan).aiOveragePerUsdDollars;
}

function resolveIncludedFirmCount(firm: {
  plan: string;
  settings: Prisma.JsonValue | null;
}): number {
  const override = readNumericSetting(firm.settings, "includedFirms");
  return override != null ? Math.floor(override) : getPlanMetadata(firm.plan).includedFirms;
}

function resolveOveragePerExtraFirmMonthlyDollars(firm: {
  plan: string;
  settings: Prisma.JsonValue | null;
}): number {
  const override = readNumericSetting(firm.settings, "overagePerExtraFirmMonthlyDollars");
  return override != null ? roundUsd(override) : getPlanMetadata(firm.plan).overagePerExtraFirmMonthlyDollars;
}

function buildUsageLimitMeter(params: {
  included: number;
  used: number;
  overageRateDollars: number;
  warningThresholdRatio?: number;
}): UsageLimitMeter {
  const included = params.included > 0 ? roundCount(params.included) : params.included;
  const used = roundCount(params.used);
  const warningThresholdRatio = params.warningThresholdRatio ?? DEFAULT_WARNING_THRESHOLD_RATIO;

  if (included <= 0) {
    return {
      included,
      used,
      remainingIncluded: null,
      warningThresholdRatio,
      warningAt: null,
      usageRatio: null,
      softCapReached: false,
      overageUnits: 0,
      overageDollars: 0,
      overageCents: 0,
      status: "within_limit",
    };
  }

  const warningAt = roundCount(included * warningThresholdRatio);
  const overageUnits = roundCount(Math.max(0, used - included));
  const remainingIncluded = roundCount(Math.max(0, included - used));
  const usageRatio = included > 0 ? roundCount(used / included) : null;
  const overageDollars = roundUsd(overageUnits * params.overageRateDollars);
  const status: UsageLimitStatus =
    overageUnits > 0 ? "over_limit" : used >= warningAt ? "warning" : "within_limit";

  return {
    included,
    used,
    remainingIncluded,
    warningThresholdRatio,
    warningAt,
      usageRatio,
      softCapReached: used >= included,
      overageUnits,
      overageDollars,
      overageCents: Math.round(overageDollars * 100),
      status,
  };
}

async function getFirmUsageMonthlyRecord(firmId: string, yearMonth: string): Promise<UsageForPeriod> {
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
      updatedAt: true,
    },
  });

  return row
    ? {
        yearMonth: row.yearMonth,
        docsProcessed: row.docsProcessed,
        pagesProcessed: row.pagesProcessed,
        insuranceDocsExtracted: row.insuranceDocsExtracted,
        courtDocsExtracted: row.courtDocsExtracted,
        narrativeGenerated: row.narrativeGenerated,
        duplicateDetected: row.duplicateDetected,
        updatedAt: row.updatedAt,
      }
    : {
        yearMonth,
        docsProcessed: 0,
        pagesProcessed: 0,
        insuranceDocsExtracted: 0,
        courtDocsExtracted: 0,
        narrativeGenerated: 0,
        duplicateDetected: 0,
        updatedAt: null,
      };
}

async function getFirmCountForBillingCustomer(
  billingCustomerId: string | null | undefined
): Promise<number> {
  if (!billingCustomerId) {
    return 1;
  }
  return prisma.firm.count({
    where: { billingCustomerId },
  });
}

function isBillingActiveNow(input: {
  billingStatus: string;
  trialEndsAt: Date | null;
}, now = new Date()): boolean {
  if (input.billingStatus === "active") {
    return true;
  }
  if (input.billingStatus === "trial" && (!input.trialEndsAt || input.trialEndsAt > now)) {
    return true;
  }
  return false;
}

type DocumentMeterSource =
  | UsageLimitMeter
  | Pick<FirmBillingUsageSnapshot, "enforcement">;

function getDocumentMeter(source: DocumentMeterSource): UsageLimitMeter {
  return "enforcement" in source ? source.enforcement.documents : source;
}

export function isOverDocumentLimit(source: DocumentMeterSource): boolean {
  const meter = getDocumentMeter(source);
  return meter.status === "over_limit" || meter.overageUnits > 0;
}

export function getDocumentIngestPolicy(
  input: DocumentIngestPolicyContext
): CanIngestResult {
  const baseResult = {
    currentDocs: input.currentDocs,
    limit: input.limit,
    billingStatus: input.billingStatus,
    status: input.meter.status,
    softCapReached: input.meter.softCapReached,
    overageDocs: input.meter.overageUnits,
    overageDollars: input.meter.overageDollars,
  };

  if (!isBillingActiveNow(input)) {
    return {
      allowed: false,
      ...baseResult,
      error: "Billing required. Trial expired or inactive.",
    };
  }

  if (isOverDocumentLimit(input.meter)) {
    return {
      allowed: false,
      ...baseResult,
      error: "Monthly document limit reached for current billing period.",
    };
  }

  return {
    allowed: true,
    ...baseResult,
  };
}

export async function getDocLimitForFirm(firmId: string): Promise<number> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { plan: true, settings: true },
  });
  if (!firm) {
    return 0;
  }
  return resolveDocumentLimit(firm);
}

export async function canIngestDocument(firmId: string): Promise<CanIngestResult> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      plan: true,
      settings: true,
      billingStatus: true,
      trialEndsAt: true,
    },
  });

  if (!firm) {
    return {
      allowed: false,
      currentDocs: 0,
      limit: 0,
      billingStatus: "missing",
      status: "within_limit",
      softCapReached: false,
      overageDocs: 0,
      overageDollars: 0,
      error: "Firm not found",
    };
  }

  const period = getBillingPeriodRange();
  const usage = await getFirmUsageMonthlyRecord(firmId, period.yearMonth);
  const meta = getPlanMetadata(firm.plan);
  const limit = resolveDocumentLimit(firm);
  const meter = buildUsageLimitMeter({
    included: limit,
    used: usage.docsProcessed,
    overageRateDollars: meta.overagePerDocDollars,
  });

  return getDocumentIngestPolicy({
    billingStatus: firm.billingStatus,
    trialEndsAt: firm.trialEndsAt,
    currentDocs: usage.docsProcessed,
    limit,
    meter,
  });
}

export async function getUsageForPeriod(
  firmId: string,
  yearMonth: string
): Promise<UsageForPeriod | null> {
  return getFirmUsageMonthlyRecord(firmId, yearMonth);
}

export async function getOverageForPeriod(
  firmId: string,
  yearMonth: string
): Promise<OverageResult | null> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { plan: true, settings: true },
  });
  if (!firm) {
    return null;
  }

  const usage = await getFirmUsageMonthlyRecord(firmId, yearMonth);
  const meta = getPlanMetadata(firm.plan);
  const limit = resolveDocumentLimit(firm);
  const meter = buildUsageLimitMeter({
    included: limit,
    used: usage.docsProcessed,
    overageRateDollars: meta.overagePerDocDollars,
  });

  return {
    yearMonth,
    docLimit: limit,
    docsProcessed: usage.docsProcessed,
    overageDocs: meter.overageUnits,
    overagePerDocDollars: meta.overagePerDocDollars,
    overageDollars: meter.overageDollars,
    overageCents: meter.overageCents,
  };
}

export async function getFirmBillingUsageSnapshot(
  firmId: string,
  at = new Date()
): Promise<FirmBillingUsageSnapshot | null> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      settings: true,
      billingStatus: true,
      trialEndsAt: true,
      billingCustomerId: true,
      pageLimitMonthly: true,
      retentionDays: true,
    },
  });
  if (!firm) {
    return null;
  }

  const period = getBillingPeriodRange(at);
  const plan = getPlanMetadata(firm.plan);
  const documentLimitMonthly = resolveDocumentLimit(firm);
  const aiIncludedMonthlyUsdEffective = resolveAiIncludedMonthlyUsd(firm);
  const aiOveragePerUsdDollarsEffective = resolveAiOveragePerUsdDollars(firm);
  const includedFirmsEffective = resolveIncludedFirmCount(firm);
  const overagePerExtraFirmMonthlyDollarsEffective = resolveOveragePerExtraFirmMonthlyDollars(firm);

  const [usage, aiSummary, currentFirmCount] = await Promise.all([
    getFirmUsageMonthlyRecord(firmId, period.yearMonth),
    getFirmAiCostSummary(firmId, { from: period.from, to: period.to }) as Promise<AiCostEntitySummary>,
    getFirmCountForBillingCustomer(firm.billingCustomerId),
  ]);

  const documents = buildUsageLimitMeter({
    included: documentLimitMonthly,
    used: usage.docsProcessed,
    overageRateDollars: plan.overagePerDocDollars,
  });
  const ai = buildUsageLimitMeter({
    included: aiIncludedMonthlyUsdEffective,
    used: aiSummary.totals.executedCostUsd,
    overageRateDollars: aiOveragePerUsdDollarsEffective,
  });
  const firms = buildUsageLimitMeter({
    included: includedFirmsEffective,
    used: currentFirmCount,
    overageRateDollars: overagePerExtraFirmMonthlyDollarsEffective,
  });

  const totalOverageDollars = roundUsd(
    documents.overageDollars + ai.overageDollars + firms.overageDollars
  );

  return {
    period: {
      yearMonth: period.yearMonth,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    firm: {
      id: firm.id,
      name: firm.name,
      rawPlan: firm.plan,
      plan: plan.slug,
      status: firm.status,
      billingStatus: firm.billingStatus,
      trialEndsAt: firm.trialEndsAt?.toISOString() ?? null,
      billingCustomerId: firm.billingCustomerId ?? null,
      pageLimitMonthly: firm.pageLimitMonthly,
      retentionDays: firm.retentionDays,
    },
    plan: {
      ...plan,
      documentLimitMonthly,
      aiIncludedMonthlyUsdEffective,
      aiOveragePerUsdDollarsEffective,
      includedFirmsEffective,
      overagePerExtraFirmMonthlyDollarsEffective,
    },
    usage: {
      ...usage,
      aiExecutedCostUsd: aiSummary.totals.executedCostUsd,
      aiCacheSavedCostUsd: aiSummary.totals.cacheSavedCostUsd,
      aiExecutedCount: aiSummary.totals.executedCount,
      aiCacheSavedCount: aiSummary.totals.cacheSavedCount,
      aiDedupeAvoidedCount: aiSummary.totals.dedupeAvoidedCount,
      aiPromptTokens: aiSummary.totals.promptTokens,
      aiCompletionTokens: aiSummary.totals.completionTokens,
      aiTotalTokens: aiSummary.totals.totalTokens,
      currentFirmCount,
    },
    enforcement: {
      documents,
      ai,
      firms,
      softCapReached: documents.softCapReached || ai.softCapReached || firms.softCapReached,
      overageActive: documents.overageUnits > 0 || ai.overageUnits > 0 || firms.overageUnits > 0,
      totalOverageDollars,
      totalOverageCents: Math.round(totalOverageDollars * 100),
    },
  };
}

export function listPlansForDisplay(): PlanMetadata[] {
  return [PLAN_METADATA.essential, PLAN_METADATA.growth, PLAN_METADATA.premium];
}
