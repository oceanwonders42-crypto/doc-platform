/**
 * Structured API errors. Never leak stack traces to normal users.
 * Return: { ok: false, error: string, code?: string }
 */
import type { Response } from "express";

const MAX_ERROR_LENGTH = 500;
const IS_DEV = process.env.NODE_ENV !== "production";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_FILE"
  | "INVALID_FILE"
  | "INTERNAL_ERROR";

export interface SafeErrorResponse {
  ok: false;
  error: string;
  code?: ErrorCode;
  requestId?: string;
}

export function sendSafeError(
  res: Response,
  status: number,
  message: string,
  code?: ErrorCode,
  requestId?: string | null
): void {
  const error = String(message).slice(0, MAX_ERROR_LENGTH);
  const body: SafeErrorResponse = { ok: false, error };
  if (code) body.code = code;
  if (requestId) body.requestId = requestId.slice(0, 64);
  res.status(status).json(body);
}

/** Use in catch blocks: log internally, respond with safe message. */
export function sendInternalError(
  res: Response,
  err: unknown,
  logFn?: (msg: string, stack?: string) => void,
  requestId?: string | null
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  if (logFn) logFn(message, stack);
  const safeMessage = IS_DEV ? message : "An unexpected error occurred. Please try again.";
  sendSafeError(res, 500, safeMessage, "INTERNAL_ERROR", requestId);
}

/** Validate ID shape (cuid-like): alphanumeric, length ~25. Reject empty or obviously invalid. */
export function isValidId(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const trimmed = value.trim();
  if (trimmed.length > 36 || trimmed.length < 10) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/** Reject invalid enum value. */
export function isValidEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
