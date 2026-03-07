"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Integration sync worker: poll mailboxes, run email ingestion, retry failed syncs, log results.
 * Run every few minutes. Start as: npx ts-node src/workers/integrationSyncWorker.ts
 */
require("dotenv/config");
const emailIngestion_1 = require("../services/emailIngestion");
const INTERVAL_MS = Number(process.env.INTEGRATION_SYNC_INTERVAL_MS) || 5 * 60 * 1000; // 5 min
async function runOnce() {
    try {
        const results = await (0, emailIngestion_1.pollAllActiveMailboxes)();
        const failed = results.filter((r) => !r.ok);
        const totalIngested = results.reduce((s, r) => s + r.attachmentsIngested, 0);
        if (results.length > 0) {
            console.log(`[integration-sync] mailboxes=${results.length} ok=${results.filter((r) => r.ok).length} failed=${failed.length} attachmentsIngested=${totalIngested}`);
        }
        if (failed.length > 0) {
            failed.forEach((r) => console.warn(`[integration-sync] mailbox ${r.mailboxId} error: ${r.error}`));
        }
    }
    catch (e) {
        console.error("[integration-sync] runOnce error", e);
    }
}
async function run() {
    console.log("[integration-sync] started", { intervalMs: INTERVAL_MS });
    await runOnce();
    setInterval(runOnce, INTERVAL_MS);
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
