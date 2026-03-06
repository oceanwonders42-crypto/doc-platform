import "dotenv/config";
import { Pool, types } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// OIDs: json = 114, jsonb = 3802
const JSON_OID = 114;
const JSONB_OID = 3802;

function parseJsonMaybe(val: any) {
  if (val == null) return null;

  // pg might give binary Buffer; jsonb binary starts with version byte = 1
  if (Buffer.isBuffer(val)) {
    const buf: Buffer = val;
    const str = buf[0] === 1 ? buf.slice(1).toString("utf8") : buf.toString("utf8");
    return JSON.parse(str);
  }

  if (typeof val === "string") return JSON.parse(val);
  return val;
}

types.setTypeParser(JSON_OID, parseJsonMaybe);
types.setTypeParser(JSONB_OID, parseJsonMaybe);

export const pgPool = new Pool({ connectionString });
