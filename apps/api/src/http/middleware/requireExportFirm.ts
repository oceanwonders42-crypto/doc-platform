import type { Request, Response, NextFunction } from "express";

/**
 * Resolves firmId for export routes. Requires auth first.
 * - PLATFORM_ADMIN: firmId from query param (required)
 * - API key: firmId from key (query param must match if provided)
 */
export function requireExportFirm(req: Request, res: Response, next: NextFunction) {
  const queryFirmId = typeof req.query.firmId === "string" ? req.query.firmId.trim() : null;
  const isAdmin = (req as any).isAdmin === true;

  if (isAdmin) {
    if (!queryFirmId) {
      return res.status(400).json({ ok: false, error: "firmId query param required" });
    }
    (req as any).firmId = queryFirmId;
    return next();
  }

  const keyFirmId = (req as any).firmId as string;
  if (queryFirmId && queryFirmId !== keyFirmId) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  next();
}
