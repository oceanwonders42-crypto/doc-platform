import { Prisma, Role } from "@prisma/client";

const ASSIGNED_CASE_ROLES = new Set<string>([
  Role.PARALEGAL,
  Role.STAFF,
  "LEGAL_ASSISTANT",
  "ATTORNEY",
  "DOC_REVIEWER",
]);

const FULL_FIRM_CASE_ROLES = new Set<string>([
  Role.PLATFORM_ADMIN,
  Role.FIRM_ADMIN,
  "OWNER",
  "ADMIN",
]);

export type CaseVisibilityContext = {
  firmId: string;
  authRole: Role | string | null | undefined;
  userId?: string | null;
  apiKeyId?: string | null;
  caseId?: string | null;
  extraWhere?: Prisma.LegalCaseWhereInput;
  allowApiKeyFirmAccess?: boolean;
};

export function normalizeCaseVisibilityRole(
  authRole: Role | string | null | undefined
): string | null {
  if (typeof authRole !== "string") return null;
  const trimmed = authRole.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export function canViewAllFirmCases(
  authRole: Role | string | null | undefined
): boolean {
  const normalizedRole = normalizeCaseVisibilityRole(authRole);
  return normalizedRole != null && FULL_FIRM_CASE_ROLES.has(normalizedRole);
}

export function requiresAssignedCaseVisibility(
  authRole: Role | string | null | undefined
): boolean {
  const normalizedRole = normalizeCaseVisibilityRole(authRole);
  return normalizedRole != null && ASSIGNED_CASE_ROLES.has(normalizedRole);
}

function buildInvisibleCaseWhere(): Prisma.LegalCaseWhereInput {
  return { id: "__no_visible_case__" };
}

export function buildVisibleCaseWhere(
  context: CaseVisibilityContext
): Prisma.LegalCaseWhereInput {
  const scopedWhere: Prisma.LegalCaseWhereInput = {
    firmId: context.firmId,
    ...(context.caseId ? { id: context.caseId } : {}),
  };

  const visibilityWhere = canViewAllFirmCases(context.authRole)
    ? scopedWhere
    : context.allowApiKeyFirmAccess && context.apiKeyId
      ? scopedWhere
      : requiresAssignedCaseVisibility(context.authRole) && context.userId
        ? { ...scopedWhere, assignedUserId: context.userId }
        : { ...scopedWhere, ...buildInvisibleCaseWhere() };

  if (!context.extraWhere) {
    return visibilityWhere;
  }

  return {
    AND: [visibilityWhere, context.extraWhere],
  };
}
