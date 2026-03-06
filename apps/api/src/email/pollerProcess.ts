import "dotenv/config";
import { runEmailPollOnce } from "./emailIngestRunner";

const intervalMs = Number(process.env.EMAIL_POLL_INTERVAL_MS || 60_000);

async function tick() {
  try {
    await runEmailPollOnce();
  } catch (e) {
    console.error("[email] poll loop error:", e);
  }
}

console.log(`[email] poller starting; interval=${intervalMs}ms`);
tick();
setInterval(tick, intervalMs);
