/**
 * Session middleware for browser-based auth.
 * Uses express-session with in-memory store; cookie is httpOnly, sameSite.
 * Session contains: userId, firmId, email, role (tenant-safe; always resolved from User).
 */
import session from "express-session";

const secret = process.env.SESSION_SECRET || process.env.API_SECRET || "onyx-intel-dev-secret-change-in-production";
const isProd = process.env.NODE_ENV === "production";

export const sessionMiddleware = session({
  name: "onyx.sid",
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

/** Session data shape we store after login */
export interface SessionUser {
  userId: string;
  firmId: string;
  email: string;
  role: string;
}
