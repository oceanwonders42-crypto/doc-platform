import type { Request, Response, NextFunction } from "express";
import { logSystemError } from "../../services/errorLog";
import { sendError } from "./sendError";

const SERVICE = "api";

/**
 * Express error-handling middleware. Logs uncaught API errors to SystemErrorLog
 * and responds with 500. Attach after all routes; use next(err) in route handlers
 * to send errors here.
 */
export function errorLogMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logSystemError(SERVICE, err).catch(() => {});
  const message = err instanceof Error ? err.message : String(err);
  sendError(res, 500, message);
}
