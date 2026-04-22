"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

export type FirmRole = "PLATFORM_ADMIN" | "FIRM_ADMIN" | "PARALEGAL" | "LEGAL_ASSISTANT" | "DOC_REVIEWER" | "STAFF" | "OWNER" | "ADMIN" | "READ_ONLY";

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
};

function isAuthMeResponse(data: unknown): data is AuthMeResponse {
  return typeof data === "object" && data !== null;
}

export type AuthState = {
  user: User | null;
  firm: Firm | null;
  role: FirmRole | string | null;
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
    isPlatformAdmin: false,
    checked: false,
    unauthorized: false,
  });

  useEffect(() => {
    const base = getApiBase();
    if (!base) {
      setState((s) => ({ ...s, user: null, firm: null, role: null, isPlatformAdmin: false, checked: true, unauthorized: true }));
      return;
    }
    fetch(`${base}/auth/me`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => {
        if (res.status === 401) {
          setState((s) => ({ ...s, user: null, firm: null, role: null, isPlatformAdmin: false, checked: true, unauthorized: true }));
          return null;
        }
        return parseJsonResponse(res);
      })
      .then((data: unknown) => {
        if (data === null) return;
        if (isAuthMeResponse(data) && data.ok && data.user) {
          setState({
            user: data.user,
            firm: data.firm ?? null,
            role: (data.role as FirmRole) ?? data.user.role ?? null,
            isPlatformAdmin: data.isPlatformAdmin === true || data.role === "PLATFORM_ADMIN",
            checked: true,
            unauthorized: false,
          });
        } else {
          setState((s) => ({ ...s, user: null, firm: null, role: null, isPlatformAdmin: false, checked: true, unauthorized: true }));
        }
      })
      .catch(() => {
        setState((s) => ({ ...s, user: null, firm: null, role: null, isPlatformAdmin: false, checked: true, unauthorized: true }));
      });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useDashboardAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx)
    return { user: null, firm: null, role: null, isPlatformAdmin: false, checked: false, unauthorized: false };
  return ctx;
}

/** Firm-level admin: can manage team, billing, firm settings, integrations (FIRM_ADMIN or legacy OWNER/ADMIN) */
export function canAccessTeam(role: FirmRole | string | null): boolean {
  return role === "FIRM_ADMIN" || role === "PLATFORM_ADMIN" || role === "OWNER" || role === "ADMIN";
}

export function canAccessBilling(role: FirmRole | string | null): boolean {
  return role === "FIRM_ADMIN" || role === "PLATFORM_ADMIN" || role === "OWNER" || role === "ADMIN";
}

export function canAccessFirmSettings(role: FirmRole | string | null): boolean {
  return role === "FIRM_ADMIN" || role === "PLATFORM_ADMIN" || role === "OWNER" || role === "ADMIN";
}

export function canAccessIntegrations(role: FirmRole | string | null): boolean {
  return role === "FIRM_ADMIN" || role === "PLATFORM_ADMIN" || role === "OWNER" || role === "ADMIN";
}

export function canAccessAuditQuality(role: FirmRole | string | null): boolean {
  return role === "FIRM_ADMIN" || role === "PLATFORM_ADMIN" || role === "OWNER" || role === "ADMIN";
}

/** Platform-level admin: can access /admin/* (platform stats, support, errors, etc.) */
export function isPlatformAdmin(role: FirmRole | string | null, isPlatformAdminFlag?: boolean): boolean {
  return isPlatformAdminFlag === true || role === "PLATFORM_ADMIN";
}

/** At least staff-level: dashboard, documents, cases, review queue, etc. */
export function isStaffOrAbove(role: FirmRole | string | null): boolean {
  return (
    role === "PLATFORM_ADMIN" ||
    role === "FIRM_ADMIN" ||
    role === "PARALEGAL" ||
    role === "LEGAL_ASSISTANT" ||
    role === "DOC_REVIEWER" ||
    role === "STAFF" ||
    role === "OWNER" ||
    role === "ADMIN"
  );
}
