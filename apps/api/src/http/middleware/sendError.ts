/**
 * Structured error response helper.
 * All API errors should use { ok: false, error: string }.
 */
import type { Response } from "express";

const MAX_ERROR_LENGTH = 500;

export function sendError(res: Response, status: number, message: string): void {
  const error = String(message).slice(0, MAX_ERROR_LENGTH);
  res.status(status).json({ ok: false, error });
}
