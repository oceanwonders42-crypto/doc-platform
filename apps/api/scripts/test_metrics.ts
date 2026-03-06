#!/usr/bin/env node
/**
 * Metrics endpoint test: GET /metrics/review returns expected shape.
 * Requires: DOC_API_URL, DOC_API_KEY.
 */
import "dotenv/config";

const BASE = process.env.DOC_API_URL || "http://localhost:4000";
const API_KEY = process.env.DOC_API_KEY || "";

async function run(): Promise<boolean> {
  if (!API_KEY) {
    console.log("FAIL  DOC_API_KEY not set");
    return false;
  }

  const res = await fetch(`${BASE}/metrics/review?range=7d`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    console.log(`FAIL  GET /metrics/review — status=${res.status}`);
    return false;
  }

  const data = (await res.json()) as any;
  if (!data || data.ok !== true) {
    console.log("FAIL  GET /metrics/review — ok !== true");
    return false;
  }

  // API returns summary: totalIngested, totalRouted, medianSeconds, currentQueueSize, topFacilities, topProviders; perDay array
  const summary = data.summary;
  const perDay = data.perDay;

  const hasSummary = summary && typeof summary === "object";
  const hasPerDay = Array.isArray(perDay);
  const hasTotal =
    hasSummary &&
    (typeof summary.totalIngested === "number" || typeof summary.totalRouted === "number");
  const hasQueueSize = hasSummary && typeof summary.currentQueueSize === "number";

  if (!hasSummary || !hasPerDay) {
    console.log("FAIL  GET /metrics/review — missing summary or perDay");
    return false;
  }
  if (!hasTotal && !hasQueueSize) {
    console.log("FAIL  GET /metrics/review — summary missing total/queue fields");
    return false;
  }

  // Optional: total / high / medium / low / missing are often computed client-side from queue; API has currentQueueSize
  console.log(
    "PASS  GET /metrics/review — summary.totalIngested=" +
      summary.totalIngested +
      " totalRouted=" +
      summary.totalRouted +
      " currentQueueSize=" +
      summary.currentQueueSize +
      " perDay.length=" +
      perDay.length
  );
  return true;
}

run()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error("Metrics test error:", err);
    process.exit(1);
  });
