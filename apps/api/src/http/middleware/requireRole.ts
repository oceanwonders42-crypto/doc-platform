/**
 * requireRole(minRole): enforce minimum role.
 * Order: PLATFORM_ADMIN > FIRM_ADMIN > STAFF
 */
import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = {
  [Role.PLATFORM_ADMIN]: 3,
  [Role.FIRM_ADMIN]: 2,
  [Role.STAFF]: 1,
};

function getRank(role: Role | string | null | undefined): number {
  if (!role || !(role in ROLE_RANK)) return 0;
  return ROLE_RANK[role as Role];
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
