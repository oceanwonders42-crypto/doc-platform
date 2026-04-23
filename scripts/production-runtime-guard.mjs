import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { collectPm2State } from "./production-guard-actions.mjs";
import {
  printFail,
  printPass,
  readLatestDeployRecord,
  resolveGitState,
  repoRoot,
} from "./deploy-lib.mjs";
import {
  normalizePath,
  resolveProductionReleaseConfig,
} from "./production-release-config.mjs";

const config = resolveProductionReleaseConfig({ repoRoot });
const allowedApps = ["doc-platform-api", "doc-platform-web", "doc-platform-worker"];

function samePath(left, right) {
  return normalizePath(left) === normalizePath(right);
}

async function inspectLinkedPath(filePath, expectedTarget) {
  try {
    const stats = await lstat(filePath);
    if (!stats.isSymbolicLink()) {
      return {
        ok: false,
        actual: filePath,
        reason: "not_a_symlink",
      };
    }
    const resolved = normalizePath(await realpath(filePath));
    return {
      ok: samePath(resolved, expectedTarget),
      actual: resolved,
      reason: samePath(resolved, expectedTarget) ? null : "wrong_target",
    };
  } catch (error) {
    return {
      ok: false,
      actual: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const latest = await readLatestDeployRecord({ config });
  const failures = [];

  if (!latest || typeof latest !== "object") {
    failures.push(`no latest deploy record found at ${config.latestDeployFile}`);
  }

  const pm2State = await collectPm2State({ cwd: config.canonicalSourceRoot });
  if (!pm2State.success) {
    failures.push(`unable to inspect PM2 state via ${pm2State.command}`);
  }

  if (latest?.releaseRoot) {
    const releaseGit = resolveGitState({ cwd: latest.releaseRoot });
    if (releaseGit.sha !== latest.commitSha) {
      failures.push(`release HEAD ${releaseGit.sha} does not match recorded commit ${latest.commitSha}`);
    }
    if (releaseGit.dirty) {
      failures.push(`release checkout ${latest.releaseRoot} is dirty (${releaseGit.dirtyEntries.join(", ")})`);
    }

    const apiEnvLink = await inspectLinkedPath(
      path.join(latest.releaseRoot, "apps", "api", ".env"),
      config.durableApiEnvPath
    );
    if (!apiEnvLink.ok) {
      failures.push(
        `API env link is not locked to ${config.durableApiEnvPath} (${apiEnvLink.reason ?? "unknown"})`
      );
    }

    const webEnvLink = await inspectLinkedPath(
      path.join(latest.releaseRoot, "apps", "web", ".env.local"),
      config.durableWebEnvPath
    );
    if (!webEnvLink.ok) {
      failures.push(
        `web env link is not locked to ${config.durableWebEnvPath} (${webEnvLink.reason ?? "unknown"})`
      );
    }
  }

  if (pm2State.success && latest?.releaseRoot) {
    for (const appName of allowedApps) {
      const app = pm2State.apps?.[appName];
      if (!app) {
        failures.push(`PM2 app ${appName} is missing`);
        continue;
      }
      if (app.status !== "online") {
        failures.push(`PM2 app ${appName} status is ${app.status ?? "unknown"}`);
      }
      if (!samePath(app.pm_cwd ?? app.cwd, appName === "doc-platform-web" ? path.join(latest.releaseRoot, "apps", "web") : path.join(latest.releaseRoot, "apps", "api"))) {
        failures.push(`PM2 app ${appName} cwd drifted to ${app.pm_cwd ?? app.cwd ?? "unknown"}`);
      }
      if (!samePath(app.script, path.join(latest.releaseRoot, "scripts", "start-service-with-build-info.mjs"))) {
        failures.push(`PM2 app ${appName} script drifted to ${app.script ?? "unknown"}`);
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      printFail(failure, "Re-pin production to the recorded release root before treating production as healthy.");
    }
    process.exit(1);
  }

  printPass(
    `runtime lock verified for ${latest.commitSha} at ${latest.releaseRoot}`
  );
}

main().catch((error) => {
  printFail(
    error instanceof Error ? error.message : String(error),
    "Fix the runtime drift guard failure before shipping another production deploy."
  );
  process.exit(1);
});
