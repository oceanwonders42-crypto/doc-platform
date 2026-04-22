import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import { getPlanMetadata, normalizePlanSlug } from "./billingPlans";

const DEFAULT_FIRM_PLAN = "essential";
const DEFAULT_API_KEY_NAME = "API Key";
const DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE = 0.9;

type SupportedFirmRole = "FIRM_ADMIN" | "PARALEGAL" | "STAFF";

export class FirmOnboardingInputError extends Error {}

export type OnboardedFirm = {
  id: string;
  name: string;
  plan: string;
  status: string;
  billingStatus: string;
  pageLimitMonthly: number;
  retentionDays: number;
};

export type OnboardedUser = {
  id: string;
  email: string;
  role: SupportedFirmRole;
  firmId: string;
  loginReady: boolean;
};

export type OnboardedApiKey = {
  id: string;
  firmId: string;
  keyPrefix: string;
  apiKey: string;
  scopes: string;
};

export type BootstrapFirmResult = {
  firm: OnboardedFirm;
  user: OnboardedUser;
  apiKey: OnboardedApiKey;
};

export type FirmBootstrapRemovalRiskCounts = {
  users: number;
  apiKeys: number;
  routingRules: number;
  mailboxConnections: number;
  firmIntegrations: number;
  webhookEndpoints: number;
  documents: number;
  cases: number;
  contacts: number;
  providers: number;
  jobs: number;
  notifications: number;
  usageMonthly: number;
  migrationBatches: number;
  demandPackages: number;
  trafficMatters: number;
  casePacketExports: number;
  clioHandoffExports: number;
};

export type FirmBootstrapRemovalCheck = {
  firm: OnboardedFirm | null;
  counts: FirmBootstrapRemovalRiskCounts;
  safeToRemove: boolean;
  blockingCounts: Array<{ name: keyof FirmBootstrapRemovalRiskCounts; count: number }>;
};

function normalizeFirmName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new FirmOnboardingInputError("name is required");
  }
  return normalized;
}

function normalizeFirmPlan(plan?: string | null): string {
  if (typeof plan !== "string") {
    return DEFAULT_FIRM_PLAN;
  }
  const normalized = plan.trim();
  return normalized ? normalizePlanSlug(normalized) : DEFAULT_FIRM_PLAN;
}

function normalizeUserEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new FirmOnboardingInputError("email is required");
  }
  return normalized;
}

function normalizeUserRole(role?: string | null): SupportedFirmRole {
  switch (role) {
    case "PARALEGAL":
      return "PARALEGAL";
    case "STAFF":
      return "STAFF";
    case "FIRM_ADMIN":
    case undefined:
    case null:
    case "":
      return "FIRM_ADMIN";
    default:
      throw new FirmOnboardingInputError("role must be FIRM_ADMIN, PARALEGAL, or STAFF");
  }
}

function normalizePassword(password?: string | null): string | null {
  if (password == null) {
    return null;
  }
  if (typeof password !== "string" || password.length === 0) {
    throw new FirmOnboardingInputError("password cannot be empty");
  }
  if (password.length < 8) {
    throw new FirmOnboardingInputError("password must be at least 8 characters");
  }
  return password;
}

export async function createFirmWithDefaults(input: {
  name: string;
  plan?: string | null;
}): Promise<OnboardedFirm> {
  const name = normalizeFirmName(input.name);
  const plan = normalizeFirmPlan(input.plan);
  const pageLimitMonthly = getPlanMetadata(plan).docLimitMonthly;

  return prisma.$transaction(async (tx) => {
    const firm = await tx.firm.create({
      data: {
        name,
        plan,
        pageLimitMonthly,
        settings: {} as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        billingStatus: true,
        pageLimitMonthly: true,
        retentionDays: true,
      },
    });

    await tx.routingRule.upsert({
      where: { firmId: firm.id },
      create: {
        firmId: firm.id,
        minAutoRouteConfidence: DEFAULT_MIN_AUTO_ROUTE_CONFIDENCE,
        autoRouteEnabled: false,
      },
      update: {},
    });

    return firm;
  });
}

export async function createFirmUser(input: {
  firmId: string;
  email: string;
  role?: string | null;
  password?: string | null;
}): Promise<OnboardedUser> {
  const email = normalizeUserEmail(input.email);
  const role = normalizeUserRole(input.role);
  const password = normalizePassword(input.password);
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const user = await prisma.user.create({
    data: {
      firmId: input.firmId,
      email,
      role,
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: {
      id: true,
      email: true,
      role: true,
      firmId: true,
    },
  });

  return {
    ...user,
    role: user.role as SupportedFirmRole,
    loginReady: passwordHash != null,
  };
}

export async function createFirmApiKey(input: {
  firmId: string;
  name?: string | null;
  scopes?: string | null;
  userId?: string | null;
}): Promise<OnboardedApiKey> {
  const apiKey = `sk_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = await bcrypt.hash(apiKey, 10);
  const scopes = typeof input.scopes === "string" && input.scopes.trim() ? input.scopes.trim() : "ingest";
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : DEFAULT_API_KEY_NAME;

  const record = await prisma.apiKey.create({
    data: {
      firmId: input.firmId,
      userId: input.userId ?? null,
      name,
      keyPrefix: apiKey.slice(0, 12),
      keyHash,
      scopes,
    },
    select: {
      id: true,
      firmId: true,
      keyPrefix: true,
      scopes: true,
    },
  });

  return {
    ...record,
    apiKey,
  };
}

export async function bootstrapFirmOnboarding(input: {
  name: string;
  plan?: string | null;
  adminEmail: string;
  adminPassword: string;
  adminRole?: string | null;
  apiKeyName?: string | null;
  apiKeyScopes?: string | null;
}): Promise<BootstrapFirmResult> {
  const firm = await createFirmWithDefaults({
    name: input.name,
    plan: input.plan,
  });

  try {
    const user = await createFirmUser({
      firmId: firm.id,
      email: input.adminEmail,
      role: input.adminRole ?? "FIRM_ADMIN",
      password: input.adminPassword,
    });
    const apiKey = await createFirmApiKey({
      firmId: firm.id,
      name: input.apiKeyName ?? `${firm.name} intake key`,
      scopes: input.apiKeyScopes ?? "ingest",
    });

    return { firm, user, apiKey };
  } catch (error) {
    await prisma.routingRule.deleteMany({ where: { firmId: firm.id } }).catch(() => {});
    await prisma.firm.deleteMany({ where: { id: firm.id } }).catch(() => {});
    throw error;
  }
}

export async function inspectFirmBootstrapRemoval(firmId: string): Promise<FirmBootstrapRemovalCheck> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      billingStatus: true,
      pageLimitMonthly: true,
      retentionDays: true,
    },
  });

  const [
    users,
    apiKeys,
    routingRules,
    mailboxConnections,
    firmIntegrations,
    webhookEndpoints,
    documents,
    cases,
    contacts,
    providers,
    jobs,
    notifications,
    usageMonthly,
    migrationBatches,
    demandPackages,
    trafficMatters,
    casePacketExports,
    clioHandoffExports,
  ] = await Promise.all([
    prisma.user.count({ where: { firmId } }),
    prisma.apiKey.count({ where: { firmId } }),
    prisma.routingRule.count({ where: { firmId } }),
    prisma.mailboxConnection.count({ where: { firmId } }),
    prisma.firmIntegration.count({ where: { firmId } }),
    prisma.webhookEndpoint.count({ where: { firmId } }),
    prisma.document.count({ where: { firmId } }),
    prisma.legalCase.count({ where: { firmId } }),
    prisma.contact.count({ where: { firmId } }),
    prisma.provider.count({ where: { firmId } }),
    prisma.job.count({ where: { firmId } }),
    prisma.notification.count({ where: { firmId } }),
    prisma.usageMonthly.count({ where: { firmId } }),
    prisma.migrationBatch.count({ where: { firmId } }),
    prisma.demandPackage.count({ where: { firmId } }),
    prisma.trafficMatter.count({ where: { firmId } }),
    prisma.casePacketExport.count({ where: { firmId } }),
    prisma.clioHandoffExport.count({ where: { firmId } }),
  ]);

  const counts: FirmBootstrapRemovalRiskCounts = {
    users,
    apiKeys,
    routingRules,
    mailboxConnections,
    firmIntegrations,
    webhookEndpoints,
    documents,
    cases,
    contacts,
    providers,
    jobs,
    notifications,
    usageMonthly,
    migrationBatches,
    demandPackages,
    trafficMatters,
    casePacketExports,
    clioHandoffExports,
  };

  const safeWhenZero: Array<keyof FirmBootstrapRemovalRiskCounts> = [
    "documents",
    "cases",
    "contacts",
    "providers",
    "jobs",
    "notifications",
    "usageMonthly",
    "migrationBatches",
    "demandPackages",
    "trafficMatters",
    "casePacketExports",
    "clioHandoffExports",
  ];

  const blockingCounts = safeWhenZero
    .map((name) => ({ name, count: counts[name] }))
    .filter((entry) => entry.count > 0);

  return {
    firm,
    counts,
    safeToRemove: blockingCounts.length === 0,
    blockingCounts,
  };
}

export async function removeFirmBootstrapArtifacts(firmId: string): Promise<FirmBootstrapRemovalCheck> {
  const check = await inspectFirmBootstrapRemoval(firmId);
  if (!check.firm) {
    throw new Error("Firm not found");
  }
  if (!check.safeToRemove) {
    const summary = check.blockingCounts.map((entry) => `${entry.name}=${entry.count}`).join(", ");
    throw new Error(`Firm has live data and is not safe to auto-remove (${summary})`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.mailboxConnection.deleteMany({ where: { firmId } });
    await tx.firmIntegration.deleteMany({ where: { firmId } });
    await tx.webhookEndpoint.deleteMany({ where: { firmId } });
    await tx.apiKey.deleteMany({ where: { firmId } });
    await tx.user.deleteMany({ where: { firmId } });
    await tx.routingRule.deleteMany({ where: { firmId } });
    await tx.firm.delete({ where: { id: firmId } });
  });

  return check;
}
