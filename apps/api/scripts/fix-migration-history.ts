/**
 * One-time script: Remove orphan migration records from _prisma_migrations.
 * These migrations (empty dirs we deleted) block prisma migrate deploy.
 * Run: cd apps/api && npx tsx scripts/fix-migration-history.ts
 */
import "dotenv/config";
import pg from "pg";

const ORPHANS = [
  "20260304000000_add_routing_status",
  "20260305000000_case_database",
  "20260306000000_add_unmatched_status",
  "20260307000000_medical_events",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const name of ORPHANS) {
      const res = await client.query(
        'DELETE FROM "_prisma_migrations" WHERE migration_name = $1 RETURNING migration_name',
        [name]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log("Removed:", name);
      }
    }
    console.log("Done. Run: pnpm exec prisma migrate deploy");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
