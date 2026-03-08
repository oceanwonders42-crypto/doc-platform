/**
 * Call POST /admin/demo/seed via HTTP (requires API running and DOC_API_KEY).
 * Run: cd apps/api && pnpm run seed:demo:http
 */
import "dotenv/config";

const BASE = process.env.DOC_API_URL || "http://127.0.0.1:4000";
const KEY = process.env.DOC_API_KEY || "";

async function main() {
  if (!KEY) {
    console.error("DOC_API_KEY not set. Add to apps/api/.env");
    process.exit(1);
  }
  const res = await fetch(`${BASE}/admin/demo/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; firmId?: string; caseIds?: string[]; documentIds?: string[] };
  if (!res.ok) {
    console.error("Seed failed:", data.error || res.status);
    process.exit(1);
  }
  console.log("Demo data seeded.", data);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
