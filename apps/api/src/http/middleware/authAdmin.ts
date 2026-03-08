import type { Request, Response, NextFunction } from "express";

function getBearerToken(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/**
 * Requires PLATFORM_ADMIN_API_KEY in env. Accepts only requests with
 * Authorization: Bearer <PLATFORM_ADMIN_API_KEY>. Use for /admin/* routes.
 */
export async function authAdmin(req: Request, res: Response, next: NextFunction) {
  const key = process.env.PLATFORM_ADMIN_API_KEY;
  if (!key || !key.trim()) {
    return res.status(503).json({ ok: false, error: "Admin API not configured" });
  }
  const token = getBearerToken(req);
  if (!token || token !== key) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  (req as any).isAdmin = true;
  next();
}
