/**
 * Security headers middleware. Apply early in the stack.
 * X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
 * Content-Security-Policy baseline. HSTS only when behind HTTPS (trust proxy).
 */
import type { Request, Response, NextFunction } from "express";

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none';"
  );
  // HSTS: only when we're behind HTTPS (e.g. trust proxy and X-Forwarded-Proto: https)
  const isSecure = (req as any).secure === true || req.get("x-forwarded-proto") === "https";
  if (isSecure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
}
