#!/usr/bin/env node
/**
 * DEPRECATED: document_recognition is now created by Prisma migrations.
 * Run: pnpm exec prisma migrate deploy
 * (or use bootstrap:dev which runs migrations)
 *
 * This script is kept for backwards compatibility; it no longer creates the table.
 */
require("dotenv").config();
const { Pool } = require("pg");

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_recognition'`
    );
    if (r.rows.length > 0) {
      console.log("✅ document_recognition table exists (managed by migrations)");
    } else {
      console.log("⚠ document_recognition not found. Run: pnpm exec prisma migrate deploy");
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
