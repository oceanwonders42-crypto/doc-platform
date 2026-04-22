/**
 * Multi-tenant isolation helpers.
 * - firmId must always come from authenticated context, never from body/query/params for data access.
 * - Use these helpers to enforce tenant scope and prevent cross-firm access.
 */
import type { Request, Response } from "express";
import { Role } from "@prisma/client";

const FIRM_ID_ERR = "Forbidden";
const NOT_FOUND_ERR = "Not found";

/** Thrown when firmId is missing from request (use in middleware or catch for 401). */
export class MissingFirmIdError extends Error {
  constructor() {
    super("Missing firmId");
    this.name = "MissingFirmIdError";
  }
}

/**
 * Require firmId from request (set by auth middleware).
 * Returns firmId or throws MissingFirmIdError.
 * Use with try/catch or after auth to send 401/403.
 */
export function requireFirmId(req: Request): string {
  const firmId = (req as Request & { firmId?: string }).firmId;
  if (!firmId || typeof firmId !== "string" || !firmId.trim()) {
    throw new MissingFirmIdError();
  }
  return firmId.trim();
}

/**
 * Assert that a record's firmId matches the current firm.
 * Throws if mismatch (caller can send 404 to avoid leaking existence).
 * Returns true if same firm.
 */
export function assertSameFirm(
  recordFirmId: string | null | undefined,
  firmId: string
): boolean {
  if (recordFirmId == null || recordFirmId !== firmId) {
    throw new Error(NOT_FOUND_ERR);
  }
  return true;
}

/**
 * Build a where clause that always includes firmId (firm-scoped query).
 * Alias for buildFirmWhere for the name requested in task.
 */
export function firmScopedWhere<T extends Record<string, unknown>>(
  firmId: string,
  where: T = {} as T
): T & { firmId: string } {
  return { ...where, firmId } as T & { firmId: string };
}

export type AuthContext = {
  firmId: string | null;
  authRole: Role;
  isPlatformAdmin: boolean;
};

/**
 * Get auth context from request (set by auth middleware).
 * firmId is null when using PLATFORM_ADMIN_API_KEY.
 */
export function getAuthContext(req: Request): AuthContext {
  const r = req as Request & { firmId?: string; authRole?: Role; isAdmin?: boolean };
  return {
    firmId: r.firmId ?? null,
    authRole: r.authRole ?? Role.STAFF,
    isPlatformAdmin: r.isAdmin === true || r.authRole === Role.PLATFORM_ADMIN,
  };
}

/**
 * Require firmId from authenticated context. Use on firm-scoped routes only.
 * Returns firmId or sends 403 and returns undefined.
 */
export function requireFirmIdFromRequest(req: Request, res: Response): string | undefined {
  const ctx = getAuthContext(req);
  if (ctx.firmId) return ctx.firmId;
  res.status(403).json({ ok: false, error: FIRM_ID_ERR });
  return undefined;
}

/**
 * Assert that a record's firmId matches the current context.
 * Call after fetching a record by id; use for update/delete/get-one.
 * Sends 404 (do not leak existence of other tenant's data) and returns false on mismatch.
 */
export function assertRecordBelongsToFirm(
  recordFirmId: string | null | undefined,
  currentFirmId: string,
  res: Response
): boolean {
  if (recordFirmId == null || recordFirmId !== currentFirmId) {
    res.status(404).json({ ok: false, error: NOT_FOUND_ERR });
    return false;
  }
  return true;
}

/**
 * Build a Prisma where clause that always includes firmId.
 * Use for findMany, findFirst, count, etc. on tenant-scoped models.
 */
export function buildFirmWhere<T extends Record<string, unknown>>(
  firmId: string,
  extraWhere?: T
): T & { firmId: string } {
  return firmScopedWhere(firmId, extraWhere ?? ({} as T));
}

/**
 * For platform-admin-only routes: allow optional firmId from query for filtering.
 * For firm users: ignore query firmId and use auth firmId only.
 * Returns the firmId to use for the query.
 */
export function getFirmIdForAdminOrFirm(
  req: Request,
  res: Response
): string | undefined {
  const ctx = getAuthContext(req);
  if (ctx.isPlatformAdmin) {
    const fromQuery = typeof req.query.firmId === "string" && req.query.firmId.trim()
      ? req.query.firmId.trim()
      : null;
    const fromBody = typeof (req.body as { firmId?: string })?.firmId === "string" && (req.body as { firmId?: string }).firmId?.trim()
      ? (req.body as { firmId: string }).firmId.trim()
      : null;
    const chosen = fromQuery ?? fromBody ?? ctx.firmId;
    if (chosen) return chosen;
    // Admin listing all: no firmId filter
    return undefined;
  }
  if (ctx.firmId) return ctx.firmId;
  res.status(403).json({ ok: false, error: FIRM_ID_ERR });
  return undefined;
}

/**
 * Reject request if body or query contains firmId and the user is not a platform admin.
 * Call early in firm-scoped routes to prevent clients from sending a different firmId.
 */
export function forbidCrossTenantAccess(req: Request, res: Response): boolean {
  const ctx = getAuthContext(req);
  if (ctx.isPlatformAdmin) return true;
  const bodyFirmId = (req.body as Record<string, unknown>)?.firmId;
  const queryFirmId = req.query.firmId;
  if (bodyFirmId != null && String(bodyFirmId).trim() !== "" && String(bodyFirmId) !== ctx.firmId) {
    res.status(403).json({ ok: false, error: FIRM_ID_ERR });
    return false;
  }
  if (queryFirmId != null && String(queryFirmId).trim() !== "" && String(queryFirmId) !== ctx.firmId) {
    res.status(403).json({ ok: false, error: FIRM_ID_ERR });
    return false;
  }
  return true;
}

/**
 * Safe 403/404: do not leak whether another tenant's resource exists.
 * Prefer 404 for "resource not found or not allowed".
 */
export function sendNotFound(res: Response, message = NOT_FOUND_ERR): void {
  res.status(404).json({ ok: false, error: message });
}

export function sendForbidden(res: Response, message = FIRM_ID_ERR): void {
  res.status(403).json({ ok: false, error: message });
}
