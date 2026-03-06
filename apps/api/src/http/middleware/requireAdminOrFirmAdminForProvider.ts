import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { requireRole } from "./requireRole";

/**
 * For routes like POST /providers/:id/invites.
 * Requires auth first. Allows either:
 * - PLATFORM_ADMIN
 * - API key with firmId matching the provider's firm, and FIRM_ADMIN role
 */
export async function requireAdminOrFirmAdminForProvider(req: Request, res: Response, next: NextFunction) {
  if ((req as any).isAdmin === true) return next();

  const providerId = String(req.params.id ?? "");
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { firmId: true },
  });
  if (!provider) {
    return res.status(404).json({ ok: false, error: "Provider not found" });
  }

  const firmId = (req as any).firmId as string;
  if (firmId !== provider.firmId) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  requireRole(Role.FIRM_ADMIN)(req, res, next);
}
