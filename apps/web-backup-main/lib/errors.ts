/**
 * Frontend error handling: user-friendly messages, retry, loading/empty/error states.
 */
import { parseJsonResponse } from "./api";

export type ApiError = {
  ok: false;
  error: string;
  code?: string;
};

export function isApiError(data: unknown): data is ApiError {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as ApiError).ok === false &&
    typeof (data as ApiError).error === "string"
  );
}

export function getErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isApiError(err)) return err.error;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

export function getErrorCode(err: unknown): string | undefined {
  if (isApiError(err)) return err.code;
  return undefined;
}

export function getUserMessage(code: string | undefined, serverMessage: string): string {
  if (code === "RATE_LIMITED") return "Too many requests. Please wait a moment and try again.";
  if (code === "UNAUTHORIZED") return "Please sign in again.";
  if (code === "FORBIDDEN") return "You don't have permission to do that.";
  if (code === "NOT_FOUND") return "The requested item was not found.";
  if (code === "PAYLOAD_TOO_LARGE") return "The file or data is too large.";
  if (code === "UNSUPPORTED_FILE" || code === "INVALID_FILE") return "This file type is not supported.";
  return serverMessage;
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }> {
  const res = await fetch(url, options);
  let data: unknown;
  try {
    data = await parseJsonResponse(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid response from server";
    return { ok: false, error: message };
  }
  if (!res.ok) {
    const error = isApiError(data) ? data.error : (data as { error?: string })?.error ?? res.statusText ?? "Request failed";
    const code = isApiError(data) ? data.code : undefined;
    return { ok: false, error, code };
  }
  return { ok: true, data: data as T };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; delayMs?: number; retryable?: (err: unknown) => boolean } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, retryable = () => true } = opts;
  let last: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === maxAttempts - 1 || !retryable(e)) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw last;
}
