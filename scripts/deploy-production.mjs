import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  appendDeployRecord,
  fetchVersionInfo,
  printFail,
  printPass,
  printWarn,
  repoRoot,
  resolveGitState,
} from "./deploy-lib.mjs";
import { verifyDeployConfig } from "./verify-deploy-config.mjs";

const rawArgs = new Set(process.argv.slice(2));
const dryRun = rawArgs.has("--dry-run");
const allowDirty = rawArgs.has("--allow-dirty");
const allowStaleMeta = rawArgs.has("--allow-stale-meta");

const gitState = resolveGitState();
const buildMeta = {
  sha: gitState.sha,
  shortSha: gitState.shortSha,
  builtAt: new Date().toISOString(),
  source: "deploy-production",
  branch: gitState.branch,
  dirty: gitState.dirty,
  versionLabel: gitState.versionLabel,
};

function logStep(message, meta) {
  if (meta) {
    console.log(`[deploy] ${message}`, meta);
    return;
  }
  console.log(`[deploy] ${message}`);
}

function resolveCommand(command) {
  if (process.platform === "win32" && (command === "pnpm" || command === "pm2")) {
    return `${command}.cmd`;
  }
  return command;
}

function withPlatformSpawnOptions(command, baseOptions) {
  const resolved = resolveCommand(command);
  return {
    resolved,
    options: {
      ...baseOptions,
      shell: process.platform === "win32" && resolved.endsWith(".cmd"),
    },
  };
}

async function run(command, args) {
  logStep(`running ${command} ${args.join(" ")}`);
  if (dryRun) {
    return;
  }

  await new Promise((resolve, reject) => {
    const { resolved, options } = withPlatformSpawnOptions(command, {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        DOC_BUILD_SHA: buildMeta.sha,
        DOC_BUILD_TIMESTAMP: buildMeta.builtAt,
        DOC_BUILD_SOURCE: buildMeta.source,
        DOC_BUILD_BRANCH: buildMeta.branch,
        DOC_BUILD_DIRTY: buildMeta.dirty ? "true" : "false",
      },
    });
    const child = spawn(resolved, args, options);

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

async function runLocalNodeScript(scriptName, args = []) {
  await run("node", [path.join("scripts", scriptName), ...args]);
}

async function runChecklist(args = []) {
  logStep(`running node scripts\\deploy-checklist.mjs ${args.join(" ")}`.trim());

  await new Promise((resolve, reject) => {
    const child = spawn("node", [path.join("scripts", "deploy-checklist.mjs"), ...args], {
      cwd: repoRoot,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`deploy-checklist exited with code ${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

async function waitForHealth(url, label) {
  logStep(`waiting for ${label}`, { url });
  if (dryRun) {
    return;
  }

  const deadline = Date.now() + 45_000;
  let lastError = "unknown";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        logStep(`${label} healthy`);
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`${label} health check failed: ${lastError}`);
}

async function verifyPm2Apps(appNames) {
  logStep("verifying PM2 apps", { appNames });
  if (dryRun) {
    return;
  }

  const deadline = Date.now() + 45_000;
  let lastStatuses = "unknown";

  while (Date.now() < deadline) {
    const output = await new Promise((resolve, reject) => {
      const { resolved, options } = withPlatformSpawnOptions("pm2", {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "inherit"],
      });
      const child = spawn(resolved, ["jlist"], options);

      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error(`pm2 jlist exited with code ${code ?? "unknown"}`));
      });
      child.on("error", reject);
    });

    const parsed = JSON.parse(output);
    const statuses = appNames.map((appName) => {
      const app = parsed.find((entry) => entry.name === appName);
      return `${appName}=${app?.pm2_env?.status ?? "missing"}`;
    });
    lastStatuses = statuses.join(", ");

    if (
      appNames.every((appName) => {
        const app = parsed.find((entry) => entry.name === appName);
        return app?.pm2_env?.status === "online";
      })
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`PM2 apps did not reach online state before timeout (${lastStatuses})`);
}

async function verifyLiveVersions() {
  const apiVersion = await fetchVersionInfo("http://127.0.0.1:4000");
  const webVersion = await fetchVersionInfo("http://127.0.0.1:3000");

  const failures = [];

  if (apiVersion.commitHash !== webVersion.commitHash) {
    failures.push(`live API commitHash ${apiVersion.commitHash} does not match live web commitHash ${webVersion.commitHash}`);
  }
  if (apiVersion.shortCommitHash !== webVersion.shortCommitHash) {
    failures.push(
      `live API shortCommitHash ${apiVersion.shortCommitHash ?? "unknown"} does not match live web shortCommitHash ${
        webVersion.shortCommitHash ?? "unknown"
      }`
    );
  }
  if (apiVersion.versionLabel !== webVersion.versionLabel) {
    failures.push(`live API versionLabel ${apiVersion.versionLabel} does not match live web versionLabel ${webVersion.versionLabel}`);
  }
  if (apiVersion.commitHash !== buildMeta.sha) {
    failures.push(`live API commitHash ${apiVersion.commitHash} does not match deployed commit ${buildMeta.sha}`);
  }
  if (webVersion.commitHash !== buildMeta.sha) {
    failures.push(`live web commitHash ${webVersion.commitHash} does not match deployed commit ${buildMeta.sha}`);
  }
  if (apiVersion.shortCommitHash !== buildMeta.shortSha) {
    failures.push(
      `live API shortCommitHash ${apiVersion.shortCommitHash ?? "unknown"} does not match deployed short SHA ${buildMeta.shortSha}`
    );
  }
  if (webVersion.shortCommitHash !== buildMeta.shortSha) {
    failures.push(
      `live web shortCommitHash ${webVersion.shortCommitHash ?? "unknown"} does not match deployed short SHA ${buildMeta.shortSha}`
    );
  }
  if (apiVersion.versionLabel !== buildMeta.versionLabel) {
    failures.push(`live API versionLabel ${apiVersion.versionLabel} does not match deployed versionLabel ${buildMeta.versionLabel}`);
  }
  if (webVersion.versionLabel !== buildMeta.versionLabel) {
    failures.push(`live web versionLabel ${webVersion.versionLabel} does not match deployed versionLabel ${buildMeta.versionLabel}`);
  }
  if (!allowDirty && apiVersion.buildDirty === true) {
    failures.push("live API reports dirty=true");
  }
  if (!allowDirty && webVersion.buildDirty === true) {
    failures.push("live web reports dirty=true");
  }
  if (allowDirty && (apiVersion.buildDirty === true || webVersion.buildDirty === true)) {
    printWarn("live services report dirty=true (bypass enabled)");
  }

  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }

  return { apiVersion, webVersion };
}

async function main() {
  logStep("resolved deploy metadata", buildMeta);

  if (!dryRun && buildMeta.sha === "unknown") {
    throw new Error("Unable to resolve build SHA. Fix git resolution before deploying.");
  }

  const checklistArgs = [];
  if (allowDirty) checklistArgs.push("--allow-dirty");
  if (allowStaleMeta) checklistArgs.push("--allow-stale-meta");
  await runChecklist(checklistArgs);

  await mkdir(path.join(repoRoot, "logs", "pm2"), { recursive: true });
  await rm(path.join(repoRoot, "apps", "web", ".next"), {
    recursive: true,
    force: true,
  });
  logStep("cleared web build output", { path: path.join(repoRoot, "apps", "web", ".next") });

  await run("pnpm", ["--dir", "apps/api", "exec", "prisma", "generate"]);
  await run("pnpm", ["--dir", "apps/api", "exec", "prisma", "migrate", "deploy"]);
  await run("pnpm", ["--dir", "apps/api", "build"]);
  await run("pnpm", ["--dir", "apps/web", "build"]);
  const deployConfig = await verifyDeployConfig({
    requireBuilt: true,
    expectedSha: buildMeta.sha,
    expectedVersionLabel: buildMeta.versionLabel,
  });
  if (deployConfig.failures.length > 0) {
    throw new Error(`deploy config verification failed: ${deployConfig.failures.join(" | ")}`);
  }
  for (const warning of deployConfig.warnings) {
    printWarn(warning);
  }
  for (const pass of deployConfig.passes) {
    logStep(pass);
  }
  await run("pm2", ["startOrReload", "ecosystem.config.cjs", "--update-env"]);
  await verifyPm2Apps(["doc-platform-api", "doc-platform-worker", "doc-platform-web"]);
  await waitForHealth("http://127.0.0.1:4000/health", "API");
  await waitForHealth("http://127.0.0.1:3000/healthz", "web");

  if (dryRun) {
    printPass(
      `dry run completed for commit ${buildMeta.sha}. Live API/web verification and deploy history write were skipped.`
    );
    return;
  }

  const { apiVersion, webVersion } = await verifyLiveVersions();

  await runLocalNodeScript("check-running-version.mjs", [
    "--expect-sha",
    buildMeta.sha,
    "--expect-short-sha",
    buildMeta.shortSha,
    "--expect-version-label",
    buildMeta.versionLabel,
    "--require-services",
    "api,web",
    ...(allowDirty ? ["--allow-dirty"] : []),
    "http://127.0.0.1:4000",
    "http://127.0.0.1:3000",
  ]);

  const record = {
    deployedAt: buildMeta.builtAt,
    commitSha: buildMeta.sha,
    shortSha: buildMeta.shortSha,
    branch: buildMeta.branch,
    dirty: buildMeta.dirty,
    versionLabel: buildMeta.versionLabel,
    actor:
      process.env.DOC_DEPLOY_ACTOR?.trim() ||
      process.env.GITHUB_ACTOR?.trim() ||
      process.env.USER?.trim() ||
      process.env.USERNAME?.trim() ||
      null,
    allowDirty,
    allowStaleMeta,
    live: {
      api: apiVersion,
      web: webVersion,
    },
  };
  await appendDeployRecord(record);

  printPass(
    `production is serving commit ${buildMeta.sha} cleanly on both api and web (versionLabel=${buildMeta.versionLabel})`
  );
}

main().catch((error) => {
  printFail(
    error instanceof Error ? error.message : String(error),
    "Fix the failing check and rerun pnpm deploy:production. If production was partially updated, inspect pnpm deploy:status and use pnpm deploy:history to choose a rollback target."
  );
  process.exit(1);
});
