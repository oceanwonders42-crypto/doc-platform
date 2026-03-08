/**
 * JWT sign/verify for user session tokens.
 * Used when the web app calls the API from another origin (Bearer token instead of cookie).
 */
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.API_SECRET || "onyx-intel-dev-jwt-change-in-production";
const DEFAULT_EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: string;
  firmId: string;
  role: string;
  email: string;
}

export function signToken(payload: JwtPayload, expiresIn: string = DEFAULT_EXPIRES_IN): string {
  const options: jwt.SignOptions = { expiresIn, algorithm: "HS256" };
  return jwt.sign(payload as object, secret, options);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    const p = decoded as Record<string, unknown>;
    if (typeof p.userId === "string" && typeof p.firmId === "string" && typeof p.role === "string") {
      return {
        userId: p.userId,
        firmId: p.firmId,
        role: p.role,
        email: typeof p.email === "string" ? p.email : "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** API keys use this prefix; tokens that don't are treated as JWT. */
export const API_KEY_PREFIX = "sk_live_";
