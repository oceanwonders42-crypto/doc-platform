"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const emailIngestRunner_1 = require("./emailIngestRunner");
const intervalMs = Number(process.env.EMAIL_POLL_INTERVAL_MS || 60_000);
async function tick() {
    try {
        await (0, emailIngestRunner_1.runEmailPollOnce)();
    }
    catch (e) {
        console.error("[email] poll loop error:", e);
    }
}
console.log(`[email] poller starting; interval=${intervalMs}ms`);
tick();
setInterval(tick, intervalMs);
