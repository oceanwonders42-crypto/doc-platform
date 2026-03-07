/**
 * Request ID and logging middleware.
 * Sets req.requestId (from X-Request-Id header or generated) and logs each request (structured JSON).
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { log } from "../../lib/logger";

export function requestIdAndLog(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.header("x-request-id") ?? req.header("X-Request-Id");
  const requestId = typeof incomingId === "string" && incomingId.trim() ? incomingId.trim().slice(0, 64) : crypto.randomBytes(8).toString("hex");
  (req as any).requestId = requestId;

  res.setHeader("X-Request-Id", requestId);

  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";
    log(level, "api_request", {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
