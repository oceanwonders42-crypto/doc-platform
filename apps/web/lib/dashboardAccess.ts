export type DashboardFeatureKey =
  | "exports_enabled"
  | "migration_batch_enabled"
  | "traffic_enabled"
  | "providers_enabled"
  | "providers_map_enabled"
  | "case_qa_enabled"
  | "missing_records_enabled"
  | "bills_vs_treatment_enabled"
  | "demand_drafts_enabled"
  | "demand_audit_enabled";

export type DashboardFeatureFlags = Record<DashboardFeatureKey, boolean>;

export type DashboardRole =
  | "PLATFORM_ADMIN"
  | "FIRM_ADMIN"
  | "ATTORNEY"
  | "PARALEGAL"
  | "ASSISTANT"
  | "STAFF"
  | "READ_ONLY";

export type DashboardNavItemId =
  | "dashboard"
  | "audit"
  | "usage"
  | "team"
  | "firmSettings"
  | "cases"
  | "demands"
  | "recordsRequests"
  | "providers"
  | "providerMap";

export type DashboardNavItem = {
  id: DashboardNavItemId;
  href: string;
  label: string;
  description?: string;
  featureKey?: DashboardFeatureKey;
};

export type DashboardRouteAccessResult = {
  allowed: boolean;
  title: string;
  message: string;
  actionHref: string;
  actionLabel: string;
};

type DashboardRouteRule = {
  match: (pathname: string) => boolean;
  label: string;
  allowedRoles: DashboardRole[];
  featureKey?: DashboardFeatureKey;
};

const DEFAULT_FEATURE_FLAGS: DashboardFeatureFlags = {
  exports_enabled: false,
  migration_batch_enabled: false,
  traffic_enabled: false,
  providers_enabled: false,
  providers_map_enabled: false,
  case_qa_enabled: false,
  missing_records_enabled: false,
  bills_vs_treatment_enabled: false,
  demand_drafts_enabled: false,
  demand_audit_enabled: false,
};

const FEATURE_ROLE_ALLOWLIST: Record<DashboardFeatureKey, DashboardRole[]> = {
  exports_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY"],
  migration_batch_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY"],
  traffic_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  providers_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY"],
  providers_map_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  case_qa_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  missing_records_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  bills_vs_treatment_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  demand_drafts_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN", "ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  demand_audit_enabled: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
};

const NAV_ITEMS: Record<
  DashboardNavItemId,
  Omit<DashboardNavItem, "label"> & { label: string | ((role: DashboardRole) => string) }
> = {
  dashboard: {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    description: "Overview",
  },
  audit: {
    id: "audit",
    href: "/dashboard/audit",
    label: "Demand Audit",
    description: "Review demand output",
    featureKey: "demand_audit_enabled",
  },
  usage: {
    id: "usage",
    href: "/dashboard/usage",
    label: "Usage",
    description: "Firm usage",
  },
  team: {
    id: "team",
    href: "/dashboard/team",
    label: "Team",
    description: "Firm directory",
  },
  firmSettings: {
    id: "firmSettings",
    href: "/dashboard/settings/firm",
    label: "Firm Settings",
    description: "Firm profile and controls",
  },
  cases: {
    id: "cases",
    href: "/dashboard/cases",
    label: "Cases",
    description: "Case workspace",
  },
  demands: {
    id: "demands",
    href: "/dashboard/demands",
    label: "Demands",
    description: "Demand workflow",
  },
  recordsRequests: {
    id: "recordsRequests",
    href: "/dashboard/records-requests",
    label: "Records Requests",
    description: "Records request workflow",
  },
  providers: {
    id: "providers",
    href: "/dashboard/providers",
    label: "Providers",
    description: "Provider directory",
    featureKey: "providers_enabled",
  },
  providerMap: {
    id: "providerMap",
    href: "/dashboard/providers/map",
    label: (role) => (role === "ATTORNEY" ? "Providers Map by State" : "Providers Map"),
    description: "Provider map",
    featureKey: "providers_map_enabled",
  },
};

const ROLE_PRIMARY_ITEMS: Record<DashboardRole, DashboardNavItemId[]> = {
  PLATFORM_ADMIN: ["dashboard", "audit", "usage"],
  FIRM_ADMIN: ["dashboard", "audit", "usage"],
  ATTORNEY: ["dashboard", "cases", "demands"],
  PARALEGAL: ["dashboard", "cases", "demands"],
  ASSISTANT: ["dashboard", "cases", "demands"],
  STAFF: ["dashboard", "cases", "demands"],
  READ_ONLY: ["dashboard"],
};

const ROLE_SECONDARY_ITEMS: Record<DashboardRole, DashboardNavItemId[]> = {
  PLATFORM_ADMIN: ["team", "firmSettings"],
  FIRM_ADMIN: ["team", "firmSettings"],
  ATTORNEY: ["recordsRequests", "providers", "providerMap", "team"],
  PARALEGAL: ["recordsRequests", "providerMap", "team"],
  ASSISTANT: ["recordsRequests", "providerMap", "team"],
  STAFF: ["recordsRequests", "providerMap", "team"],
  READ_ONLY: [],
};

const OPERATOR_ROLES: DashboardRole[] = [
  "PLATFORM_ADMIN",
  "FIRM_ADMIN",
  "ATTORNEY",
  "PARALEGAL",
  "ASSISTANT",
  "STAFF",
];

const ROUTE_RULES: DashboardRouteRule[] = [
  {
    match: (pathname) => pathname === "/dashboard/audit" || pathname.startsWith("/dashboard/audit/"),
    label: "Demand Audit",
    allowedRoles: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
    featureKey: "demand_audit_enabled",
  },
  {
    match: (pathname) => pathname === "/dashboard/usage" || pathname.startsWith("/dashboard/usage/"),
    label: "Usage",
    allowedRoles: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
  },
  {
    match: (pathname) => pathname === "/dashboard/team" || pathname.startsWith("/dashboard/team/"),
    label: "Team",
    allowedRoles: OPERATOR_ROLES,
  },
  {
    match: (pathname) => pathname === "/dashboard/settings/firm" || pathname.startsWith("/dashboard/settings/firm/"),
    label: "Firm Settings",
    allowedRoles: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
  },
  {
    match: (pathname) => pathname === "/dashboard/settings/billing" || pathname.startsWith("/dashboard/settings/billing/"),
    label: "Billing",
    allowedRoles: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
  },
  {
    match: (pathname) => pathname === "/dashboard/billing" || pathname.startsWith("/dashboard/billing/"),
    label: "Billing",
    allowedRoles: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
  },
  {
    match: (pathname) => pathname === "/dashboard/integrations" || pathname.startsWith("/dashboard/integrations/"),
    label: "Connect to Clio",
    allowedRoles: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
  },
  {
    match: (pathname) => pathname === "/dashboard/settings/clio" || pathname.startsWith("/dashboard/settings/clio/"),
    label: "Connect to Clio",
    allowedRoles: ["PLATFORM_ADMIN", "FIRM_ADMIN"],
  },
  {
    match: (pathname) => pathname === "/dashboard/cases" || pathname.startsWith("/dashboard/cases/"),
    label: "Cases",
    allowedRoles: ["ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  },
  {
    match: (pathname) => pathname === "/dashboard/demands" || pathname.startsWith("/dashboard/demands/"),
    label: "Demands",
    allowedRoles: ["ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  },
  {
    match: (pathname) => pathname === "/dashboard/records-requests" || pathname.startsWith("/dashboard/records-requests/"),
    label: "Records Requests",
    allowedRoles: ["ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
  },
  {
    match: (pathname) => pathname === "/dashboard/providers/map" || pathname.startsWith("/dashboard/providers/map/"),
    label: "Providers Map",
    allowedRoles: ["ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF"],
    featureKey: "providers_map_enabled",
  },
  {
    match: (pathname) => pathname === "/dashboard/providers" || pathname.startsWith("/dashboard/providers/"),
    label: "Providers",
    allowedRoles: ["ATTORNEY"],
    featureKey: "providers_enabled",
  },
  {
    match: (pathname) => pathname === "/dashboard/exports" || pathname.startsWith("/dashboard/exports/"),
    label: "Exports",
    allowedRoles: FEATURE_ROLE_ALLOWLIST.exports_enabled,
    featureKey: "exports_enabled",
  },
  {
    match: (pathname) => pathname === "/dashboard/migration" || pathname.startsWith("/dashboard/migration/"),
    label: "Migration Batch",
    allowedRoles: FEATURE_ROLE_ALLOWLIST.migration_batch_enabled,
    featureKey: "migration_batch_enabled",
  },
  {
    match: (pathname) => pathname === "/dashboard/traffic" || pathname.startsWith("/dashboard/traffic/"),
    label: "Traffic",
    allowedRoles: FEATURE_ROLE_ALLOWLIST.traffic_enabled,
    featureKey: "traffic_enabled",
  },
  {
    match: (pathname) => pathname === "/dashboard/documents" || pathname.startsWith("/dashboard/documents/"),
    label: "Documents",
    allowedRoles: OPERATOR_ROLES,
  },
  {
    match: (pathname) => pathname === "/dashboard/review" || pathname.startsWith("/dashboard/review/"),
    label: "Review",
    allowedRoles: OPERATOR_ROLES,
  },
];

function buildNavItem(id: DashboardNavItemId, role: DashboardRole): DashboardNavItem {
  const item = NAV_ITEMS[id];
  return {
    ...item,
    label: typeof item.label === "function" ? item.label(role) : item.label,
  };
}

export function normalizeDashboardRole(role: string | null | undefined): DashboardRole {
  const normalized = String(role ?? "")
    .trim()
    .toUpperCase();

  switch (normalized) {
    case "PLATFORM_ADMIN":
      return "PLATFORM_ADMIN";
    case "FIRM_ADMIN":
    case "OWNER":
    case "ADMIN":
      return "FIRM_ADMIN";
    case "ATTORNEY":
      return "ATTORNEY";
    case "ASSISTANT":
    case "LEGAL_ASSISTANT":
      return "ASSISTANT";
    case "PARALEGAL":
      return "PARALEGAL";
    case "STAFF":
    case "DOC_REVIEWER":
      return "STAFF";
    default:
      return "READ_ONLY";
  }
}

export function getDefaultDashboardFeatureFlags(): DashboardFeatureFlags {
  return { ...DEFAULT_FEATURE_FLAGS };
}

export function normalizeDashboardFeatureFlags(
  value: Partial<Record<string, unknown>> | null | undefined
): DashboardFeatureFlags {
  return {
    exports_enabled: Boolean(value?.exports_enabled ?? value?.exports),
    migration_batch_enabled: Boolean(value?.migration_batch_enabled ?? value?.migration),
    traffic_enabled: Boolean(value?.traffic_enabled ?? value?.traffic),
    providers_enabled: Boolean(value?.providers_enabled ?? value?.providers),
    providers_map_enabled: Boolean(
      value?.providers_map_enabled ?? value?.providers_map ?? value?.provider_map
    ),
    case_qa_enabled: Boolean(value?.case_qa_enabled ?? value?.case_insights),
    missing_records_enabled: Boolean(value?.missing_records_enabled ?? value?.case_insights),
    bills_vs_treatment_enabled: Boolean(value?.bills_vs_treatment_enabled ?? value?.case_insights),
    demand_drafts_enabled: Boolean(value?.demand_drafts_enabled ?? value?.demand_narratives),
    demand_audit_enabled: Boolean(value?.demand_audit_enabled ?? value?.demand_audit),
  };
}

export function canViewTeam(role: string | null | undefined): boolean {
  return normalizeDashboardRole(role) !== "READ_ONLY";
}

export function canManageTeam(role: string | null | undefined): boolean {
  const normalizedRole = normalizeDashboardRole(role);
  return normalizedRole === "PLATFORM_ADMIN" || normalizedRole === "FIRM_ADMIN";
}

export function canAccessBilling(role: string | null | undefined): boolean {
  return canManageTeam(role);
}

export function canAccessFirmSettings(role: string | null | undefined): boolean {
  return canManageTeam(role);
}

export function canAccessIntegrations(role: string | null | undefined): boolean {
  return canManageTeam(role);
}

export function canAccessDemandAudit(role: string | null | undefined): boolean {
  return canManageTeam(role);
}

export function canAccessDashboardFeature(
  featureKey: DashboardFeatureKey,
  role: string | null | undefined,
  features: Partial<Record<string, unknown>> | null | undefined
): boolean {
  const normalizedRole = normalizeDashboardRole(role);
  const normalizedFeatures = normalizeDashboardFeatureFlags(features);
  return (
    normalizedFeatures[featureKey] &&
    FEATURE_ROLE_ALLOWLIST[featureKey].includes(normalizedRole)
  );
}

export function getDashboardNav(
  role: string | null | undefined,
  features: Partial<Record<string, unknown>> | null | undefined
) {
  const normalizedRole = normalizeDashboardRole(role);
  const normalizedFeatures = normalizeDashboardFeatureFlags(features);

  const filterItems = (itemIds: DashboardNavItemId[]) =>
    itemIds
      .map((itemId) => buildNavItem(itemId, normalizedRole))
      .filter((item) =>
        item.featureKey
          ? canAccessDashboardFeature(item.featureKey, normalizedRole, normalizedFeatures)
          : true
      );

  return {
    role: normalizedRole,
    features: normalizedFeatures,
    primary: filterItems(ROLE_PRIMARY_ITEMS[normalizedRole]),
    secondary: filterItems(ROLE_SECONDARY_ITEMS[normalizedRole]),
  };
}

export function getDashboardWorkspaceLinks(
  role: string | null | undefined,
  features: Partial<Record<string, unknown>> | null | undefined
) {
  const { primary, secondary } = getDashboardNav(role, features);
  return [...primary, ...secondary].filter((item) => item.id !== "dashboard");
}

export function getDashboardRouteAccess(
  pathname: string,
  role: string | null | undefined,
  features: Partial<Record<string, unknown>> | null | undefined
): DashboardRouteAccessResult {
  const normalizedRole = normalizeDashboardRole(role);
  const normalizedFeatures = normalizeDashboardFeatureFlags(features);
  const matchedRule = ROUTE_RULES.find((rule) => rule.match(pathname));

  if (!matchedRule) {
    return {
      allowed: true,
      title: "Available",
      message: "",
      actionHref: "/dashboard",
      actionLabel: "Back to dashboard",
    };
  }

  if (!matchedRule.allowedRoles.includes(normalizedRole)) {
    return {
      allowed: false,
      title: "Unavailable for this role",
      message: `${matchedRule.label} is not available for your current role.`,
      actionHref: "/dashboard",
      actionLabel: "Back to dashboard",
    };
  }

  if (matchedRule.featureKey) {
    const enabled = normalizedFeatures[matchedRule.featureKey];
    const roleAllowed = FEATURE_ROLE_ALLOWLIST[matchedRule.featureKey].includes(normalizedRole);
    if (!enabled || !roleAllowed) {
      return {
        allowed: false,
        title: `${matchedRule.label} disabled`,
        message: `${matchedRule.label} is not enabled for this firm and role combination.`,
        actionHref: "/dashboard",
        actionLabel: "Back to dashboard",
      };
    }
  }

  return {
    allowed: true,
    title: matchedRule.label,
    message: "",
    actionHref: "/dashboard",
    actionLabel: "Back to dashboard",
  };
}

export function formatDashboardRoleLabel(role: string | null | undefined): string {
  const normalizedRole = normalizeDashboardRole(role);
  switch (normalizedRole) {
    case "PLATFORM_ADMIN":
      return "Platform Admin";
    case "FIRM_ADMIN":
      return "Firm Admin";
    case "ATTORNEY":
      return "Attorney";
    case "PARALEGAL":
      return "Paralegal";
    case "ASSISTANT":
      return "Assistant";
    case "STAFF":
      return "Staff";
    default:
      return "Read Only";
  }
}
