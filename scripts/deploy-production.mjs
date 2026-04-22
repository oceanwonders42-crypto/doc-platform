import { mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  appendDeployRecord,
  fetchVersionInfo,
  inspectDeploySource,
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
const deploySource = inspectDeploySource(gitState);
const buildMeta = {
  sha: gitState.sha,
  shortSha: gitState.shortSha,
  builtAt: new Date().toISOString(),
  source: "deploy-production",
  branch: gitState.branch,
  dirty: gitState.dirty,
  versionLabel: gitState.versionLabel,
};

const targetPm2Apps = [
  {
    name: "doc-platform-api",
    cwd: path.join(repoRoot, "apps", "api"),
    script: path.join(repoRoot, "scripts", "start-service-with-build-info.mjs"),
    args: ["api", "node", "dist/http/server.js"],
    expectedEnv: {
      DOC_BUILD_SHA: buildMeta.sha,
      DOC_BUILD_SOURCE: buildMeta.source,
      DOC_BUILD_BRANCH: buildMeta.branch,
      DOC_BUILD_DIRTY: buildMeta.dirty ? "true" : "false",
    },
    outFile: path.join(repoRoot, "logs", "pm2", "api-out.log"),
    errorFile: path.join(repoRoot, "logs", "pm2", "api-error.log"),
  },
  {
    name: "doc-platform-worker",
    cwd: path.join(repoRoot, "apps", "api"),
    script: path.join(repoRoot, "scripts", "start-service-with-build-info.mjs"),
    args: ["worker", "node", "dist/workers/worker.js"],
    expectedEnv: {
      DOC_BUILD_SHA: buildMeta.sha,
      DOC_BUILD_SOURCE: buildMeta.source,
      DOC_BUILD_BRANCH: buildMeta.branch,
      DOC_BUILD_DIRTY: buildMeta.dirty ? "true" : "false",
    },
    outFile: path.join(repoRoot, "logs", "pm2", "worker-out.log"),
    errorFile: path.join(repoRoot, "logs", "pm2", "worker-error.log"),
  },
  {
    name: "doc-platform-web",
    cwd: path.join(repoRoot, "apps", "web"),
    script: path.join(repoRoot, "scripts", "start-service-with-build-info.mjs"),
    args: ["web", "node", "node_modules/next/dist/bin/next", "start"],
    expectedEnv: {
      DOC_BUILD_SHA: buildMeta.sha,
      DOC_BUILD_SOURCE: buildMeta.source,
      DOC_BUILD_BRANCH: buildMeta.branch,
      DOC_BUILD_DIRTY: buildMeta.dirty ? "true" : "false",
    },
    outFile: path.join(repoRoot, "logs", "pm2", "web-out.log"),
    errorFile: path.join(repoRoot, "logs", "pm2", "web-error.log"),
  },
];

function logStep(message, meta) {
  if (meta) {
    console.log(`[deploy] ${message}`, meta);
    return;
  }
  console.log(`[deploy] ${message}`);
}

function normalizePath(value) {
  return path.normalize(String(value ?? ""));
}

function samePath(left, right) {
  return normalizePath(left) === normalizePath(right);
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

async function runAndCapture(command, args) {
  if (dryRun) {
    return { stdout: "", stderr: "" };
  }

  return new Promise((resolve, reject) => {
    const { resolved, options } = withPlatformSpawnOptions(command, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
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
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
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

async function readPm2List() {
  const { stdout } = await runAndCapture("pm2", ["jlist"]);
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(`pm2 jlist returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForPm2AppsOnline(expectedApps) {
  const deadline = Date.now() + 45_000;
  let lastStatuses = "unknown";

  while (Date.now() < deadline) {
    const parsed = await readPm2List();
    const statuses = expectedApps.map((expectedApp) => {
      const app = parsed.find((entry) => entry.name === expectedApp.name);
      return `${expectedApp.name}=${app?.pm2_env?.status ?? "missing"}`;
    });
    lastStatuses = statuses.join(", ");

    if (
      expectedApps.every((expectedApp) => {
        const app = parsed.find((entry) => entry.name === expectedApp.name);
        return app?.pm2_env?.status === "online";
      })
    ) {
      return parsed;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`PM2 apps did not reach online state before timeout (${lastStatuses})`);
}

function collectPm2RuntimeFailures(parsedApps, expectedApps, options = {}) {
  const requireOnlineStatus = options.requireOnlineStatus !== false;
  const failures = [];

  for (const expectedApp of expectedApps) {
    const app = parsedApps.find((entry) => entry.name === expectedApp.name);
    if (!app) {
      failures.push(`PM2 app ${expectedApp.name} is missing after deploy`);
      continue;
    }

    const env = app.pm2_env ?? {};
    const nestedEnv = env.env ?? {};
    const actualStatus = app.status ?? env.status;
    const actualCwd = app.pm_cwd ?? app.cwd ?? env.pm_cwd ?? env.cwd;
    const actualScript = app.pm_exec_path ?? env.pm_exec_path;
    const actualArgs = Array.isArray(app.args) ? app.args : Array.isArray(env.args) ? env.args : [];
    const actualOutLog = app.pm_out_log_path ?? env.pm_out_log_path;
    const actualErrorLog = app.pm_err_log_path ?? env.pm_err_log_path;
    const actualPwd = app.PWD ?? app.cwd ?? nestedEnv.PWD;
    const actualRuntimeEnv = {
      DOC_BUILD_SHA: readScriptEnv(app, env, nestedEnv, "DOC_BUILD_SHA"),
      DOC_BUILD_SOURCE: readScriptEnv(app, env, nestedEnv, "DOC_BUILD_SOURCE"),
      DOC_BUILD_BRANCH: readScriptEnv(app, env, nestedEnv, "DOC_BUILD_BRANCH"),
      DOC_BUILD_DIRTY: readScriptEnv(app, env, nestedEnv, "DOC_BUILD_DIRTY"),
    };

    if (requireOnlineStatus && actualStatus !== "online") {
      failures.push(`PM2 app ${expectedApp.name} status is ${actualStatus ?? "missing"} after deploy`);
    }
    if (!samePath(actualCwd, expectedApp.cwd)) {
      failures.push(`PM2 app ${expectedApp.name} cwd is ${actualCwd}; expected ${expectedApp.cwd}`);
    }
    if (!samePath(actualScript, expectedApp.script)) {
      failures.push(`PM2 app ${expectedApp.name} script is ${actualScript}; expected ${expectedApp.script}`);
    }
    if (JSON.stringify(actualArgs) !== JSON.stringify(expectedApp.args)) {
      failures.push(
        `PM2 app ${expectedApp.name} args are ${JSON.stringify(actualArgs)}; expected ${JSON.stringify(expectedApp.args)}`
      );
    }
    if (!samePath(actualOutLog, expectedApp.outFile)) {
      failures.push(`PM2 app ${expectedApp.name} out log is ${actualOutLog}; expected ${expectedApp.outFile}`);
    }
    if (!samePath(actualErrorLog, expectedApp.errorFile)) {
      failures.push(`PM2 app ${expectedApp.name} error log is ${actualErrorLog}; expected ${expectedApp.errorFile}`);
    }
    if (actualPwd && !samePath(actualPwd, expectedApp.cwd)) {
      failures.push(`PM2 app ${expectedApp.name} env.PWD is ${actualPwd}; expected ${expectedApp.cwd}`);
    }
    for (const [key, expectedValue] of Object.entries(expectedApp.expectedEnv ?? {})) {
      if ((actualRuntimeEnv[key] ?? null) !== expectedValue) {
        failures.push(
          `PM2 app ${expectedApp.name} env.${key} is ${actualRuntimeEnv[key] ?? "missing"}; expected ${expectedValue}`
        );
      }
    }
  }

  return failures;
}

function readScriptEnv(app, env, nestedEnv, key) {
  return app?.[key] ?? env?.[key] ?? nestedEnv?.[key] ?? null;
}

async function verifyPm2Runtime(expectedApps) {
  if (dryRun) {
    return;
  }

  const parsed = await readPm2List();
  const failures = collectPm2RuntimeFailures(parsed, expectedApps);
  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }

  logStep("verified PM2 runtime release paths", {
    releaseRoot: repoRoot,
    appNames: expectedApps.map((app) => app.name),
  });
}

function resolvePm2Home() {
  if (process.env.PM2_HOME?.trim()) {
    return process.env.PM2_HOME.trim();
  }
  if (process.env.USERPROFILE?.trim()) {
    return path.join(process.env.USERPROFILE.trim(), ".pm2");
  }
  if (process.env.HOME?.trim()) {
    return path.join(process.env.HOME.trim(), ".pm2");
  }
  return null;
}

async function verifyPm2SavedState(expectedApps) {
  if (dryRun) {
    return;
  }

  const pm2Home = resolvePm2Home();
  if (!pm2Home) {
    throw new Error("Unable to resolve PM2 home directory for dump verification");
  }

  const dumpPath = path.join(pm2Home, "dump.pm2");
  const raw = await readFile(dumpPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`PM2 dump file ${dumpPath} did not contain an app array`);
  }

  const failures = collectPm2RuntimeFailures(parsed, expectedApps, { requireOnlineStatus: false });
  if (failures.length > 0) {
    throw new Error(`PM2 saved state mismatch: ${failures.join(" | ")}`);
  }

  logStep("verified PM2 saved state", { dumpPath, releaseRoot: repoRoot });
}

async function replacePm2Apps(expectedApps) {
  if (dryRun) {
    return;
  }

  const parsed = await readPm2List();
  const existingAppNames = expectedApps
    .map((expectedApp) => expectedApp.name)
    .filter((appName) => parsed.some((entry) => entry.name === appName));

  logStep("switching PM2 apps via explicit replacement", {
    strategy: "delete-start-save",
    appNames: expectedApps.map((app) => app.name),
    existingAppNames,
  });

  if (existingAppNames.length > 0) {
    await run("pm2", ["delete", ...existingAppNames]);
  }

  await run("pm2", ["start", "ecosystem.config.cjs"]);
  await waitForPm2AppsOnline(expectedApps);
  await verifyPm2Runtime(expectedApps);
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
  if ((apiVersion.buildSource ?? "unknown") !== (webVersion.buildSource ?? "unknown")) {
    failures.push(
      `live API buildSource ${apiVersion.buildSource ?? "unknown"} does not match live web buildSource ${webVersion.buildSource ?? "unknown"}`
    );
  }
  if (apiVersion.buildDirty !== webVersion.buildDirty) {
    failures.push(
      `live API buildDirty ${apiVersion.buildDirty === null ? "unknown" : apiVersion.buildDirty} does not match live web buildDirty ${
        webVersion.buildDirty === null ? "unknown" : webVersion.buildDirty
      }`
    );
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
  if (apiVersion.buildSource == null) {
    failures.push("live API did not report buildSource");
  }
  if (webVersion.buildSource == null) {
    failures.push("live web did not report buildSource");
  }
  if (apiVersion.buildDirty === null) {
    failures.push("live API did not report buildDirty");
  }
  if (webVersion.buildDirty === null) {
    failures.push("live web did not report buildDirty");
  }
  if (apiVersion.buildDirty !== buildMeta.dirty) {
    failures.push(`live API buildDirty is ${apiVersion.buildDirty ?? "unknown"} instead of deployed dirty=${buildMeta.dirty}`);
  }
  if (webVersion.buildDirty !== buildMeta.dirty) {
    failures.push(`live web buildDirty is ${webVersion.buildDirty ?? "unknown"} instead of deployed dirty=${buildMeta.dirty}`);
  }
  if (apiVersion.buildSource !== buildMeta.source) {
    failures.push(`live API buildSource ${apiVersion.buildSource ?? "unknown"} does not match deployed source ${buildMeta.source}`);
  }
  if (webVersion.buildSource !== buildMeta.source) {
    failures.push(`live web buildSource ${webVersion.buildSource ?? "unknown"} does not match deployed source ${buildMeta.source}`);
  }

  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }

  return { apiVersion, webVersion };
}

async function main() {
  logStep("resolved deploy metadata", buildMeta);

  if (!deploySource.ok) {
    throw new Error(`deploy blocked: ${deploySource.failures.join(" | ")}`);
  }

  for (const warning of deploySource.warnings) {
    printWarn(`deploy source warning: ${warning}`);
  }

  logStep("verified git-backed deploy source", {
    commit: gitState.sha,
    branch: gitState.branch,
    dirty: gitState.dirty,
    bundleDetected: deploySource.bundleDetected,
  });

  if (!dryRun && buildMeta.sha === "unknown") {
    throw new Error("Unable to resolve build SHA. Fix git resolution before deploying.");
  }

  const checklistArgs = [];
  if (allowDirty) checklistArgs.push("--allow-dirty");
  checklistArgs.push("--allow-stale-meta");
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
  await replacePm2Apps(targetPm2Apps);
  await waitForHealth("http://127.0.0.1:4000/health", "API");
  await waitForHealth("http://127.0.0.1:3000/healthz", "web");

  if (dryRun) {
    printPass(
      `dry run completed for commit ${buildMeta.sha}. Live API/web verification and deploy history write were skipped.`
    );
    return;
  }

  const { apiVersion, webVersion } = await verifyLiveVersions();
  await runLocalNodeScript("deploy-smoke.mjs", ["--base-url", "http://127.0.0.1:4000"]);
  await run("pm2", ["save"]);
  await verifyPm2SavedState(targetPm2Apps);

  await runLocalNodeScript("check-running-version.mjs", [
    "--expect-sha",
    buildMeta.sha,
    "--expect-short-sha",
    buildMeta.shortSha,
    "--expect-version-label",
    buildMeta.versionLabel,
    "--expect-build-source",
    buildMeta.source,
    "--expect-build-dirty",
    buildMeta.dirty ? "true" : "false",
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
