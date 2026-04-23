import { commitsMatch, fetchVersionInfo, printFail, printPass, readLatestDeployRecord, repoRoot } from "./deploy-lib.mjs";
import { resolveProductionReleaseConfig } from "./production-release-config.mjs";
import { collectPm2State } from "./production-guard-actions.mjs";

const config = resolveProductionReleaseConfig({ repoRoot });
const failures = [];

const latest = await readLatestDeployRecord({ config });
if (!latest || typeof latest !== "object") {
  printFail("no recorded production deploy was found", `Run pnpm deploy:production from ${config.canonicalSourceRoot}.`);
  process.exit(1);
}

console.log(`[deploy-status] recorded commit=${latest.commitSha}`);
console.log(`[deploy-status] recorded branch=${latest.branch}`);
console.log(`[deploy-status] recorded releaseRoot=${latest.releaseRoot}`);
console.log(`[deploy-status] recorded sourceRoot=${latest.sourceRoot}`);
console.log(`[deploy-status] recorded actor=${latest.actor ?? "unknown"}`);

const versions = {
  localhostApi: await fetchVersionInfo("http://127.0.0.1:4000").catch((error) => ({ error })),
  localhostWeb: await fetchVersionInfo("http://127.0.0.1:3000").catch((error) => ({ error })),
  publicApi: await fetchVersionInfo("https://api.onyxintels.com/api/version").catch((error) => ({ error })),
  publicWeb: await fetchVersionInfo("https://onyxintels.com/version").catch((error) => ({ error })),
};

for (const [label, payload] of Object.entries(versions)) {
  if (payload?.error) {
    failures.push(`${label} is unreachable: ${payload.error instanceof Error ? payload.error.message : String(payload.error)}`);
    continue;
  }
  console.log(
    `[deploy-status] ${label} sha=${payload.commitHash} source=${payload.buildSource ?? "unknown"} dirty=${
      payload.buildDirty === true ? "YES" : payload.buildDirty === false ? "NO" : "unknown"
    } versionLabel=${payload.versionLabel}`
  );
  if (!commitsMatch(latest.commitSha, payload.commitHash)) {
    failures.push(`${label} commit ${payload.commitHash} does not match recorded ${latest.commitSha}`);
  }
}

const pm2State = await collectPm2State({ cwd: config.canonicalSourceRoot });
if (!pm2State.success) {
  failures.push(`unable to read PM2 state (${pm2State.command})`);
} else {
  for (const appName of ["doc-platform-api", "doc-platform-web", "doc-platform-worker"]) {
    const app = pm2State.apps?.[appName];
    if (!app) {
      failures.push(`${appName} is missing from PM2`);
      continue;
    }
    console.log(`[deploy-status] ${appName} cwd=${app.pm_cwd ?? app.cwd ?? "unknown"} script=${app.script ?? "unknown"} status=${app.status}`);
    if (!String(app.pm_cwd ?? app.cwd ?? "").startsWith(latest.releaseRoot)) {
      failures.push(`${appName} is not running from recorded release root ${latest.releaseRoot}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    printFail(failure, "Re-run the runtime guard and redeploy from the canonical source if production has drifted.");
  }
  process.exit(1);
}

printPass(`production matches recorded release ${latest.commitSha} at ${latest.releaseRoot}`);
