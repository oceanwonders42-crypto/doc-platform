import path from "node:path";
import {
  assessBuildMeta,
  printFail,
  printPass,
  printWarn,
  readBuildMeta,
  repoRoot,
  resolveGitState,
} from "./deploy-lib.mjs";
import { verifyDeployConfig } from "./verify-deploy-config.mjs";

const rawArgs = new Set(process.argv.slice(2));
const allowDirty = rawArgs.has("--allow-dirty");
const allowStaleMeta = rawArgs.has("--allow-stale-meta");

const gitState = resolveGitState();
const apiBuildMeta = await readBuildMeta(path.join(repoRoot, "apps", "api"));
const webBuildMeta = await readBuildMeta(path.join(repoRoot, "apps", "web"));

const failures = [];
const deployConfig = await verifyDeployConfig();

console.log(
  `[deploy-checklist] branch=${gitState.branch} sha=${gitState.sha} dirty=${gitState.dirty ? "YES" : "NO"}`
);

for (const pass of deployConfig.passes) {
  printPass(pass);
}
for (const warning of deployConfig.warnings) {
  printWarn(warning);
}
failures.push(...deployConfig.failures);

if (gitState.sha === "unknown") {
  failures.push("git SHA could not be resolved");
}

if (gitState.dirty) {
  const detail = gitState.dirtyEntries.slice(0, 5).join(", ");
  if (allowDirty) {
    printWarn(`git working tree is dirty (bypass enabled): ${detail}`);
  } else {
    failures.push(`git working tree is dirty${detail ? `: ${detail}` : ""}`);
  }
} else {
  printPass("git working tree is clean");
}

for (const [service, buildMeta] of [
  ["api", apiBuildMeta],
  ["web", webBuildMeta],
]) {
  if (!buildMeta) {
    if (allowStaleMeta) {
      printWarn(`${service} build-meta.json is missing (bypass enabled)`);
    } else {
      failures.push(`${service} build-meta.json is missing`);
    }
    continue;
  }

  const assessment = assessBuildMeta(service, buildMeta, gitState, { allowDirty });
  for (const warning of assessment.warnings) {
    printWarn(warning);
  }

  if (assessment.failures.length > 0) {
    if (allowStaleMeta) {
      for (const failure of assessment.failures) {
        printWarn(`${failure} (bypass enabled)`);
      }
    } else {
      failures.push(...assessment.failures);
    }
  } else {
    printPass(
      `${service} build metadata matches HEAD (${buildMeta.shortSha}, dirty=${buildMeta.dirty === true ? "YES" : "NO"})`
    );
  }
}

if (apiBuildMeta && webBuildMeta && apiBuildMeta.sha !== webBuildMeta.sha) {
  printWarn(
    `api/web build-meta disagree before deploy (api=${apiBuildMeta.sha}, web=${webBuildMeta.sha})`
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    printFail(
      failure,
      failure.includes("dirty")
        ? "Commit or stash the changes, then rerun pnpm deploy:production. Use --allow-dirty only for an intentional emergency deploy."
        : "Rebuild apps/api and apps/web so build-meta.json matches HEAD, then rerun pnpm deploy:production. Use --allow-stale-meta only if you intentionally accept stale metadata."
    );
  }
  process.exit(1);
}

if (allowDirty || allowStaleMeta) {
  printWarn("deploy checklist passed with bypass flags enabled");
} else {
  printPass("deploy checklist passed in safe mode");
}
