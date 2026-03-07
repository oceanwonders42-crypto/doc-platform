/**
 * Structured error response helper.
 * All API errors should use { ok: false, error: string, code?: string, requestId?: string }.
 */
import type { Response } from "express";
import type { ErrorCode } from "../../lib/errors";

const MAX_ERROR_LENGTH = 500;

export function sendError(
  res: Response,
  status: number,
  message: string,
  code?: ErrorCode,
  requestId?: string | null
): void {
  const error = String(message).slice(0, MAX_ERROR_LENGTH);
  const body: { ok: false; error: string; code?: ErrorCode; requestId?: string } = { ok: false, error };
  if (code) body.code = code;
  if (requestId) body.requestId = requestId.slice(0, 64);
  res.status(status).json(body);
}
