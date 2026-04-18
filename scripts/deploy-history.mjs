import { readDeployHistory } from "./deploy-lib.mjs";

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(Number.parseInt(limitArg.split("=")[1] ?? "10", 10) || 10, 1) : 10;

const items = await readDeployHistory(limit);

if (items.length === 0) {
  console.log("PASS: no deploy records have been written yet");
  process.exit(0);
}

console.log(`[deploy-history] showing ${items.length} recent deploy record(s)`);
for (const item of items) {
  console.log(
    `- ${item.deployedAt} sha=${item.commitSha} shortSha=${item.shortSha} branch=${item.branch} dirty=${
      item.dirty ? "YES" : "NO"
    } actor=${item.actor ?? "unknown"} versionLabel=${item.versionLabel}`
  );
}

console.log("PASS: deploy history loaded");
