import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma";

function base64url(buf: Buffer) {
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

  const token = "sk_" + base64url(crypto.randomBytes(30));
  const prefix = token.slice(0, 12);
  const hash = await bcrypt.hash(token, 10);

  const rec = await prisma.apiKey.create({
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

main().finally(async () => prisma.$disconnect());
