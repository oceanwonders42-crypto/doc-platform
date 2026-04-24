"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import {
  canAccessBilling as canAccessBillingByRole,
  canAccessDemandAudit,
  canAccessFirmSettings as canAccessFirmSettingsByRole,
  canAccessIntegrations as canAccessIntegrationsByRole,
  canManageTeam,
  canViewTeam,
  formatDashboardRoleLabel,
  getDefaultDashboardFeatureFlags,
  normalizeDashboardFeatureFlags,
  normalizeDashboardRole,
  type DashboardFeatureFlags,
} from "@/lib/dashboardAccess";

export type FirmRole =
  | "PLATFORM_ADMIN"
  | "FIRM_ADMIN"
  | "ATTORNEY"
  | "PARALEGAL"
  | "LEGAL_ASSISTANT"
  | "ASSISTANT"
  | "DOC_REVIEWER"
  | "STAFF"
  | "OWNER"
  | "ADMIN"
  | "READ_ONLY";

export type User = {
  id: string;
  email: string;
  role: FirmRole | string;
  displayName?: string;
  status?: string;
};

export type Firm = {
  id: string;
  name: string;
  plan?: string;
  status?: string;
  billingEmail?: string;
};

type AuthMeResponse = {
  ok?: boolean;
  user?: User;
  firm?: Firm | null;
  role?: string;
  isPlatformAdmin?: boolean;
  featureFlags?: Partial<Record<keyof DashboardFeatureFlags, boolean>>;
};

function isAuthMeResponse(data: unknown): data is AuthMeResponse {
  return typeof data === "object" && data !== null;
}

export type AuthState = {
  user: User | null;
  firm: Firm | null;
  role: FirmRole | string | null;
  dashboardRole: ReturnType<typeof normalizeDashboardRole>;
  featureFlags: DashboardFeatureFlags;
  isPlatformAdmin: boolean;
  checked: boolean;
  unauthorized: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function DashboardAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    firm: null,
    role: null,
    dashboardRole: normalizeDashboardRole(null),
    featureFlags: getDefaultDashboardFeatureFlags(),
    isPlatformAdmin: false,
    checked: false,
    unauthorized: false,
  });

  useEffect(() => {
    const base = getApiBase();
    if (!base) {
      setState((s) => ({
        ...s,
        user: null,
        firm: null,
        role: null,
        dashboardRole: normalizeDashboardRole(null),
        featureFlags: getDefaultDashboardFeatureFlags(),
        isPlatformAdmin: false,
        checked: true,
        unauthorized: true,
      }));
      return;
    }
    fetch(`${base}/auth/me`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => {
        if (res.status === 401) {
          setState((s) => ({
            ...s,
            user: null,
            firm: null,
            role: null,
            dashboardRole: normalizeDashboardRole(null),
            featureFlags: getDefaultDashboardFeatureFlags(),
            isPlatformAdmin: false,
            checked: true,
            unauthorized: true,
          }));
          return null;
        }
        return parseJsonResponse(res);
      })
      .then((data: unknown) => {
        if (data === null) return;
        if (isAuthMeResponse(data) && data.ok && data.user) {
          const resolvedRole = (data.role as FirmRole) ?? data.user.role ?? null;
          setState({
            user: { ...data.user, role: resolvedRole ?? data.user.role },
            firm: data.firm ?? null,
            role: resolvedRole,
            dashboardRole: normalizeDashboardRole(resolvedRole),
            featureFlags: normalizeDashboardFeatureFlags(data.featureFlags),
            isPlatformAdmin: data.isPlatformAdmin === true || data.role === "PLATFORM_ADMIN",
            checked: true,
            unauthorized: false,
          });
        } else {
          setState((s) => ({
            ...s,
            user: null,
            firm: null,
            role: null,
            dashboardRole: normalizeDashboardRole(null),
            featureFlags: getDefaultDashboardFeatureFlags(),
            isPlatformAdmin: false,
            checked: true,
            unauthorized: true,
          }));
        }
      })
      .catch(() => {
        setState((s) => ({
          ...s,
          user: null,
          firm: null,
          role: null,
          dashboardRole: normalizeDashboardRole(null),
          featureFlags: getDefaultDashboardFeatureFlags(),
          isPlatformAdmin: false,
          checked: true,
          unauthorized: true,
        }));
      });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useDashboardAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx)
    return {
      user: null,
      firm: null,
      role: null,
      dashboardRole: normalizeDashboardRole(null),
      featureFlags: getDefaultDashboardFeatureFlags(),
      isPlatformAdmin: false,
      checked: false,
      unauthorized: false,
    };
  return ctx;
}

/** Team page visibility for firm users. */
export function canViewTeamDirectory(role: FirmRole | string | null): boolean {
  return canViewTeam(role);
}

/** Team management (invites and role changes) remains admin-only. */
export function canAccessTeam(role: FirmRole | string | null): boolean {
  return canManageTeam(role);
}

export function canAccessBilling(role: FirmRole | string | null): boolean {
  return canAccessBillingByRole(role);
}

export function canAccessFirmSettings(role: FirmRole | string | null): boolean {
  return canAccessFirmSettingsByRole(role);
}

export function canAccessIntegrations(role: FirmRole | string | null): boolean {
  return canAccessIntegrationsByRole(role);
}

export function canAccessAuditQuality(role: FirmRole | string | null): boolean {
  return canAccessDemandAudit(role);
}

/** Platform-level admin: can access /admin/* (platform stats, support, errors, etc.) */
export function isPlatformAdmin(role: FirmRole | string | null, isPlatformAdminFlag?: boolean): boolean {
  return isPlatformAdminFlag === true || role === "PLATFORM_ADMIN";
}

/** At least staff-level: dashboard, documents, cases, review queue, etc. */
export function isStaffOrAbove(role: FirmRole | string | null): boolean {
  return normalizeDashboardRole(role) !== "READ_ONLY";
}

export function getDashboardRoleLabel(role: FirmRole | string | null): string {
  return formatDashboardRoleLabel(role);
}
