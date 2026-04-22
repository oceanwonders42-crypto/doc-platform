/**
 * requireRole(minRole): enforce minimum role.
 * Order: PLATFORM_ADMIN > FIRM_ADMIN > PARALEGAL = STAFF (PARALEGAL can access STAFF routes only).
 */
import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = {
  [Role.PLATFORM_ADMIN]: 3,
  [Role.FIRM_ADMIN]: 2,
  [Role.PARALEGAL]: 1,
  [Role.STAFF]: 1,
};

const ROLE_ALIAS_RANK: Record<string, number> = {
  OWNER: ROLE_RANK[Role.FIRM_ADMIN],
  ADMIN: ROLE_RANK[Role.FIRM_ADMIN],
  ATTORNEY: ROLE_RANK[Role.STAFF],
  LEGAL_ASSISTANT: ROLE_RANK[Role.PARALEGAL],
  DOC_REVIEWER: ROLE_RANK[Role.STAFF],
  READ_ONLY: 0,
};

function getRank(role: Role | string | null | undefined): number {
  if (role && role in ROLE_RANK) {
    return ROLE_RANK[role as Role];
  }
  if (typeof role === "string") {
    const normalized = role.trim().toUpperCase();
    return ROLE_ALIAS_RANK[normalized] ?? 0;
  }
  return 0;
}

/**
 * Requires auth first. Enforces that req.authRole >= minRole.
 */
export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authRole = (req as any).authRole as Role | undefined;
    if (!authRole) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    if (getRank(authRole) < getRank(minRole)) {
      return res.status(403).json({ ok: false, error: `Role ${minRole} or higher required` });
    }
    next();
  };
}
