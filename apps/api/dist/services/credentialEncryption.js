"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
/**
 * Encrypt/decrypt integration credentials at rest.
 * Uses AES-256-GCM with ENCRYPTION_KEY (32-byte hex or base64).
 * Never log or return decrypted secrets to the frontend.
 */
const crypto_1 = __importDefault(require("crypto"));
const ALG = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;
function getKey() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw || raw.length < 32) {
        throw new Error("ENCRYPTION_KEY must be set and at least 32 chars (e.g. 64 hex or 44 base64)");
    }
    if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
        return Buffer.from(raw, "hex");
    }
    return Buffer.from(raw, "base64");
}
function encryptSecret(plain) {
    const key = getKey();
    const iv = crypto_1.default.randomBytes(IV_LEN);
    const cipher = crypto_1.default.createCipheriv(ALG, key, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
}
function decryptSecret(encrypted) {
    const key = getKey();
    const buf = Buffer.from(encrypted, "base64");
    if (buf.length < IV_LEN + AUTH_TAG_LEN) {
        throw new Error("Invalid encrypted payload");
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const decipher = crypto_1.default.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final("utf8");
}
