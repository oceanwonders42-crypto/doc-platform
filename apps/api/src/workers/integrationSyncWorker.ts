/**
 * Integration sync worker: poll mailboxes, run email ingestion, retry failed syncs, log results.
 * Run every few minutes. Start as: npx ts-node src/workers/integrationSyncWorker.ts
 */
import "dotenv/config";
import { pollAllActiveMailboxes } from "../services/emailIngestion";

const INTERVAL_MS = Number(process.env.INTEGRATION_SYNC_INTERVAL_MS) || 5 * 60 * 1000; // 5 min
const LOCAL_SANDBOX_SCOPE_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX === "true";

function normalizeScopeId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const POLL_SCOPE = LOCAL_SANDBOX_SCOPE_ENABLED
  ? {
      firmId: normalizeScopeId(process.env.INTEGRATION_SYNC_FIRM_ID),
      mailboxId: normalizeScopeId(process.env.INTEGRATION_SYNC_MAILBOX_ID),
    }
  : {};

async function runOnce(): Promise<void> {
  try {
    const results = await pollAllActiveMailboxes(POLL_SCOPE);
    const failed = results.filter((r) => !r.ok);
    const totalIngested = results.reduce((s, r) => s + r.attachmentsIngested, 0);
    if (results.length > 0) {
      console.log(
        `[integration-sync] mailboxes=${results.length} ok=${results.filter((r) => r.ok).length} failed=${failed.length} attachmentsIngested=${totalIngested}`
      );
    }
    if (failed.length > 0) {
      failed.forEach((r) => console.warn(`[integration-sync] mailbox ${r.mailboxId} error: ${r.error}`));
    }
  } catch (e) {
    console.error("[integration-sync] runOnce error", e);
  }
}

async function run() {
  console.log("[integration-sync] started", { intervalMs: INTERVAL_MS, scope: POLL_SCOPE });
  await runOnce();
  setInterval(runOnce, INTERVAL_MS);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
