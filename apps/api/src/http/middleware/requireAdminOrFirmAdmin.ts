import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { requireRole } from "./requireRole";

/**
 * For routes like POST /firms/:id/users and POST /firms/:id/api-keys.
 * Requires auth first. Allows either:
 * - PLATFORM_ADMIN (isAdmin)
 * - API key with firmId matching params.id and FIRM_ADMIN/PLATFORM_ADMIN role
 */
export function requireAdminOrFirmAdminForFirm(req: Request, res: Response, next: NextFunction) {
  if ((req as any).isAdmin === true) return next();

  const firmId = (req as any).firmId as string;
  const paramId = String(req.params.id ?? req.params.firmId ?? "");
  if (firmId !== paramId) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  requireRole(Role.FIRM_ADMIN)(req, res, next);
}
