import type { Request, Response, NextFunction } from "express";
import { logSystemError } from "../../services/errorLog";
import { sendSafeError } from "../../lib/errors";

const SERVICE = "api";

/**
 * Express error-handling middleware. Logs uncaught API errors to SystemErrorLog
 * and responds with safe structured error (no stack to client). Includes requestId in response.
 */
export function errorLogMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const r = req as Request & { firmId?: string; userId?: string; requestId?: string };
  const requestId = r.requestId ?? null;
  const meta = {
    firmId: r.firmId ?? null,
    userId: r.userId ?? null,
    requestId,
    area: "api",
    route: req.path ?? null,
    method: req.method ?? null,
    severity: "ERROR" as const,
    status: "OPEN" as const,
  };
  logSystemError(SERVICE, err, undefined, meta).catch(() => {});
  const message = err instanceof Error ? err.message : String(err);
  sendSafeError(res, 500, message, "INTERNAL_ERROR", requestId);
}
