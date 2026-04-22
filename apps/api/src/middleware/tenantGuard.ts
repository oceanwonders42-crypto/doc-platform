/**
 * Tenant guard middleware: attach req.tenant from authenticated context and reject if no firmId.
 * Use after auth() on routes that must have a tenant context.
 * Returns 401 when the request has no authenticated firm (e.g. platform-admin key with no firm).
 */
import type { Request, Response, NextFunction } from "express";

export type TenantContext = {
  firmId: string;
};

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export function tenantGuard(req: Request, res: Response, next: NextFunction): void {
  const firmId = (req as Request & { firmId?: string }).firmId;
  if (!firmId || typeof firmId !== "string" || !firmId.trim()) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  (req as Request & { tenant: TenantContext }).tenant = { firmId: firmId.trim() };
  next();
}
