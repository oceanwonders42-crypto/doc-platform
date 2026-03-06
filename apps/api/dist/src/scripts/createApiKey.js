"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../db/prisma");
function base64url(buf) {
    return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
async function main() {
    const firmId = process.argv[2];
    if (!firmId) {
        console.error("Usage: tsx src/scripts/createApiKey.ts <firmId>");
        process.exit(1);
    }
    const token = "sk_" + base64url(crypto_1.default.randomBytes(30));
    const prefix = token.slice(0, 12);
    const hash = await bcryptjs_1.default.hash(token, 10);
    const rec = await prisma_1.prisma.apiKey.create({
        data: {
            firmId,
            name: "Email Poller Dev Key",
            keyPrefix: prefix,
            keyHash: hash,
            scopes: "ingest",
        },
        select: { id: true, keyPrefix: true, firmId: true },
    });
    console.log("PLAINTEXT_API_KEY (save now):");
    console.log(token);
    console.log("apiKeyId:", rec.id);
    console.log("firmId:", rec.firmId);
    console.log("keyPrefix:", rec.keyPrefix);
}
main().finally(async () => prisma_1.prisma.$disconnect());
