import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/prisma";
import { Role } from "@prisma/client";

/**
 * Requires authApiKey first. Checks that the API key's user has FIRM_ADMIN or
 * PLATFORM_ADMIN role. If the key has no userId (service key), allows access
 * for backward compatibility.
 */
export async function requireFirmAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKeyId = (req as any).apiKeyId as string | undefined;
  if (!apiKeyId) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { userId: true },
  });
  if (!apiKey) return res.status(401).json({ ok: false, error: "API key not found" });

  // Service keys (no user) are allowed for backward compatibility
  if (!apiKey.userId) return next();

  const user = await prisma.user.findUnique({
    where: { id: apiKey.userId },
    select: { role: true },
  });
  if (!user) return next();

  if (user.role === Role.FIRM_ADMIN || user.role === Role.PLATFORM_ADMIN) {
    return next();
  }

  return res.status(403).json({ ok: false, error: "Firm admin role required" });
}
