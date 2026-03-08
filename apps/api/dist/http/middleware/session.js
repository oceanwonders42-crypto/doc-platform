"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionMiddleware = void 0;
/**
 * Session middleware for browser-based auth.
 * Uses express-session with in-memory store; cookie is httpOnly, sameSite.
 * Session contains: userId, firmId, email, role (tenant-safe; always resolved from User).
 */
const express_session_1 = __importDefault(require("express-session"));
const secret = process.env.SESSION_SECRET || process.env.API_SECRET || "onyx-intel-dev-secret-change-in-production";
const isProd = process.env.NODE_ENV === "production";
exports.sessionMiddleware = (0, express_session_1.default)({
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
