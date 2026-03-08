/**
 * Request guards: validation and abuse prevention.
 * - Validate IDs (cuid-like)
 * - Reject oversized payloads (body size is set on express.json; this can check content-length)
 * - Optional IP-based rate limit for unauthenticated routes
 */
import type { Request, Response, NextFunction } from "express";
import { sendSafeError } from "../../lib/errors";

const MAX_CONTENT_LENGTH = 25 * 1024 * 1024; // 25MB, should match express.json limit

/** Reject request if Content-Length exceeds limit. */
export function maxBodySize(maxBytes: number = MAX_CONTENT_LENGTH) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const len = req.get("content-length");
    if (len) {
      const n = parseInt(len, 10);
      if (Number.isFinite(n) && n > maxBytes) {
        sendSafeError(res, 413, "Request entity too large", "PAYLOAD_TOO_LARGE");
        return;
      }
    }
    next();
  };
}

/** Validate :id param is a valid cuid-like string. Call after route matched. */
export function validateIdParam(paramName: string = "id") {
  return function (req: Request, res: Response, next: NextFunction): void {
    const id = req.params[paramName];
    if (id == null || typeof id !== "string" || !id.trim()) {
      sendSafeError(res, 400, "Invalid or missing ID", "VALIDATION_ERROR");
      return;
    }
    const trimmed = id.trim();
    if (trimmed.length > 36 || trimmed.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      sendSafeError(res, 400, "Invalid ID format", "VALIDATION_ERROR");
      return;
    }
    next();
  };
}

/** Normalize empty string to null for body fields (optional use in routes). */
export function normalizeEmptyString<T>(value: T): T | null {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}
