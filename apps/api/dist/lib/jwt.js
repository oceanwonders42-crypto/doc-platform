"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_KEY_PREFIX = void 0;
exports.signToken = signToken;
exports.verifyToken = verifyToken;
/**
 * JWT sign/verify for user session tokens.
 * Used when the web app calls the API from another origin (Bearer token instead of cookie).
 */
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.API_SECRET || "onyx-intel-dev-jwt-change-in-production";
const DEFAULT_EXPIRES_IN = "7d";
function signToken(payload, expiresIn = DEFAULT_EXPIRES_IN) {
    const options = { algorithm: "HS256", expiresIn: expiresIn };
    return jsonwebtoken_1.default.sign(payload, secret, options);
}
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, secret, { algorithms: ["HS256"] });
        const p = decoded;
        if (typeof p.userId === "string" && typeof p.firmId === "string" && typeof p.role === "string") {
            return {
                userId: p.userId,
                firmId: p.firmId,
                role: p.role,
                email: typeof p.email === "string" ? p.email : "",
            };
        }
        return null;
    }
    catch {
        return null;
    }
}
/** API keys use this prefix; tokens that don't are treated as JWT. */
exports.API_KEY_PREFIX = "sk_live_";
