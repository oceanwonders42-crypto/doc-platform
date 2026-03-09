"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

export type FirmRole = "OWNER" | "ADMIN" | "STAFF" | "READ_ONLY";

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
  firm?: Firm;
  role?: string;
};

function isAuthMeResponse(data: unknown): data is AuthMeResponse {
  return typeof data === "object" && data !== null;
}

export type AuthState = {
  user: User | null;
  firm: Firm | null;
  role: FirmRole | string | null;
  checked: boolean;
  unauthorized: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function DashboardAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    firm: null,
    role: null,
    checked: false,
    unauthorized: false,
  });

  useEffect(() => {
    const base = getApiBase();
    if (!base) {
      setState((s) => ({ ...s, user: null, firm: null, role: null, checked: true, unauthorized: true }));
      return;
    }
    fetch(`${base}/auth/me`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => {
        if (res.status === 401) {
          setState((s) => ({ ...s, user: null, firm: null, role: null, checked: true, unauthorized: true }));
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
            checked: true,
            unauthorized: false,
          });
        } else {
          setState((s) => ({ ...s, user: null, firm: null, role: null, checked: true, unauthorized: true }));
        }
      })
      .catch(() => {
        setState((s) => ({ ...s, user: null, firm: null, role: null, checked: true, unauthorized: true }));
      });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useDashboardAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx)
    return { user: null, firm: null, role: null, checked: false, unauthorized: false };
  return ctx;
}

export function canAccessTeam(role: FirmRole | string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canAccessBilling(role: FirmRole | string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canAccessFirmSettings(role: FirmRole | string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canAccessIntegrations(role: FirmRole | string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canAccessAuditQuality(role: FirmRole | string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function isStaffOrAbove(role: FirmRole | string | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "STAFF";
}
