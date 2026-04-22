/**
 * Platform stability layer — smoke tests (errors, validation, file security).
 * Run: pnpm -C apps/api test:stability
 */
import { isValidId, isValidEnum, sendSafeError } from "../../src/lib/errors";
import { validateFileType, validateUploadFile } from "../../src/services/fileSecurityScan";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

console.log("Platform stability tests");

// --- lib/errors: isValidId
assert(!isValidId(""), "isValidId: empty rejected");
assert(!isValidId("ab"), "isValidId: too short rejected");
assert(!isValidId("a".repeat(40)), "isValidId: too long rejected");
assert(!isValidId("bad id!"), "isValidId: invalid chars rejected");
assert(isValidId("clxyz1234567890abcdefghij"), "isValidId: valid cuid-like");
assert(isValidId("abc_def-123"), "isValidId: underscore hyphen allowed");

// --- lib/errors: isValidEnum
assert(!isValidEnum("x", ["A", "B"]), "isValidEnum: invalid value");
assert(isValidEnum("A", ["A", "B"]), "isValidEnum: valid value");

// --- lib/errors: sendSafeError (mock res)
let statusSent = 0;
let bodySent: unknown = null;
const mockRes = {
  status(s: number) {
    statusSent = s;
    return mockRes;
  },
  json(b: unknown) {
    bodySent = b;
  },
};
sendSafeError(mockRes as any, 400, "Bad request", "VALIDATION_ERROR");
assert(statusSent === 400, "sendSafeError: status set");
assert(bodySent !== null && typeof bodySent === "object" && (bodySent as any).ok === false, "sendSafeError: ok false");
assert((bodySent as any).error === "Bad request", "sendSafeError: error message");
assert((bodySent as any).code === "VALIDATION_ERROR", "sendSafeError: code set");
assert(!(bodySent as any).stack, "sendSafeError: no stack to client");

// --- fileSecurityScan: validateFileType
assert(!validateFileType("file.exe", "application/octet-stream").ok, "validateFileType: exe rejected");
assert(!validateFileType("script.js", "text/javascript").ok, "validateFileType: js rejected");
assert(validateFileType("doc.pdf", "application/pdf").ok, "validateFileType: pdf allowed");
assert(validateFileType("img.png", "image/png").ok, "validateFileType: png allowed");
assert(!validateFileType("", "application/pdf").ok, "validateFileType: empty name rejected");

// --- fileSecurityScan: validateUploadFile
const bigSize = 26 * 1024 * 1024;
assert(!validateUploadFile({ originalname: "a.pdf", mimetype: "application/pdf", size: bigSize, buffer: Buffer.alloc(0) }).ok, "validateUploadFile: oversized rejected");
assert(validateUploadFile({ originalname: "a.pdf", mimetype: "application/pdf", size: 1000, buffer: Buffer.alloc(0) }).ok, "validateUploadFile: valid pdf accepted");
assert(!validateUploadFile({ originalname: "x.exe", mimetype: "application/octet-stream", size: 100, buffer: Buffer.alloc(0) }).ok, "validateUploadFile: exe rejected");

console.log("All platform stability tests passed");
