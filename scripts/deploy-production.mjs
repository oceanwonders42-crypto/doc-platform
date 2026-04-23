import { lstat, mkdir, readFile, readlink, rm, symlink } from "node:fs/promises";
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
  runGit,
  writeLatestDeployRecord,
} from "./deploy-lib.mjs";
import { resolveProductionReleaseConfig, buildReleaseName, normalizePath, pathWithin } from "./production-release-config.mjs";
import { verifyDeployConfig } from "./verify-deploy-config.mjs";

const rawArgs = new Set(process.argv.slice(2));
const dryRun = rawArgs.has("--dry-run");
const allowDirty = rawArgs.has("--allow-dirty");
const allowStaleMeta = rawArgs.has("--allow-stale-meta");
const allowLegacyRuntimeBootstrap = rawArgs.has("--allow-legacy-runtime-bootstrap");

const productionConfig = resolveProductionReleaseConfig({ repoRoot });
const sourceGitState = resolveGitState({ cwd: repoRoot });
const deploySource = inspectDeploySource(sourceGitState, {
  cwd: repoRoot,
  canonicalRemote: productionConfig.canonicalRemote,
  canonicalBranch: productionConfig.canonicalBranch,
});
const buildMeta = {
  sha: sourceGitState.sha,
  shortSha: sourceGitState.shortSha,
  builtAt: new Date().toISOString(),
  source: "deploy-production",
  branch: sourceGitState.branch,
  dirty: sourceGitState.dirty,
  versionLabel: sourceGitState.versionLabel,
};
const releaseRoot = path.join(
  productionConfig.releasesRoot,
  buildReleaseName({
    branch: buildMeta.branch,
    shortSha: buildMeta.shortSha,
    builtAt: buildMeta.builtAt,
  })
);

const sharedRuntimeEnv = {
  DOC_BUILD_SHA: buildMeta.sha,
  DOC_BUILD_TIMESTAMP: buildMeta.builtAt,
  DOC_BUILD_SOURCE: buildMeta.source,
  DOC_BUILD_BRANCH: buildMeta.branch,
  DOC_BUILD_DIRTY: buildMeta.dirty ? "true" : "false",
  DOC_PROD_STATE_ROOT: productionConfig.stateRoot,
  DOC_PROD_RELEASE_ROOT: releaseRoot,
  DOC_PROD_CANONICAL_SOURCE: productionConfig.canonicalSourceRoot,
  DOC_PROD_CANONICAL_REMOTE: productionConfig.canonicalRemote,
  DOC_PROD_CANONICAL_BRANCH: productionConfig.canonicalBranch,
  DOC_PROD_API_ENV: productionConfig.durableApiEnvPath,
  DOC_PROD_WEB_ENV: productionConfig.durableWebEnvPath,
  DOC_PROD_LOG_ROOT: productionConfig.pm2LogRoot,
  DOC_RUNTIME_RELEASE_LOCK: "true",
};

const targetPm2Apps = [
  {
    name: "doc-platform-api",
    cwd: path.join(releaseRoot, "apps", "api"),
    script: path.join(releaseRoot, "scripts", "start-service-with-build-info.mjs"),
    args: ["api", "node", "dist/http/server.js"],
    expectedEnv: sharedRuntimeEnv,
    outFile: path.join(productionConfig.pm2LogRoot, "api-out.log"),
    errorFile: path.join(productionConfig.pm2LogRoot, "api-error.log"),
  },
  {
    name: "doc-platform-worker",
    cwd: path.join(releaseRoot, "apps", "api"),
    script: path.join(releaseRoot, "scripts", "start-service-with-build-info.mjs"),
    args: ["worker", "node", "dist/workers/worker.js"],
    expectedEnv: sharedRuntimeEnv,
    outFile: path.join(productionConfig.pm2LogRoot, "worker-out.log"),
    errorFile: path.join(productionConfig.pm2LogRoot, "worker-error.log"),
  },
  {
    name: "doc-platform-web",
    cwd: path.join(releaseRoot, "apps", "web"),
    script: path.join(releaseRoot, "scripts", "start-service-with-build-info.mjs"),
    args: ["web", "node", "node_modules/next/dist/bin/next", "start"],
    expectedEnv: sharedRuntimeEnv,
    outFile: path.join(productionConfig.pm2LogRoot, "web-out.log"),
    errorFile: path.join(productionConfig.pm2LogRoot, "web-error.log"),
  },
];

function logStep(message, meta) {
  if (meta) {
    console.log(`[deploy] ${message}`, meta);
    return;
  }
  console.log(`[deploy] ${message}`);
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

async function run(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const env = {
    ...process.env,
    ...sharedRuntimeEnv,
    ...(options.env ?? {}),
  };
  logStep(`running ${command} ${args.join(" ")}`, { cwd });
  if (dryRun) return;

  await new Promise((resolve, reject) => {
    const { resolved, options: spawnOptions } = withPlatformSpawnOptions(command, {
      cwd,
      stdio: "inherit",
      env,
    });
    const child = spawn(resolved, args, spawnOptions);
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

async function runAndCapture(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const env = {
    ...process.env,
    ...sharedRuntimeEnv,
    ...(options.env ?? {}),
  };
  if (dryRun) {
    return { stdout: "", stderr: "" };
  }

  return new Promise((resolve, reject) => {
    const { resolved, options: spawnOptions } = withPlatformSpawnOptions(command, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    const child = spawn(resolved, args, spawnOptions);
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

async function runLocalNodeScript(scriptName, args = [], options = {}) {
  await run("node", [path.join("scripts", scriptName), ...args], options);
}

async function runChecklist(args = []) {
  await run("node", [path.join("scripts", "deploy-checklist.mjs"), ...args], { cwd: repoRoot });
}

async function ensureWorkspaceDependencies(targetRoot) {
  await run("pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"], { cwd: targetRoot });
}

async function waitForHealth(url, label) {
  logStep(`waiting for ${label}`, { url });
  if (dryRun) return;

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
  const { stdout } = await runAndCapture("pm2", ["jlist"], {
    cwd: productionConfig.canonicalSourceRoot,
  });
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

    if (expectedApps.every((expectedApp) => parsed.find((entry) => entry.name === expectedApp.name)?.pm2_env?.status === "online")) {
      return parsed;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`PM2 apps did not reach online state before timeout (${lastStatuses})`);
}

function readScriptEnv(app, env, nestedEnv, key) {
  return app?.[key] ?? env?.[key] ?? nestedEnv?.[key] ?? null;
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
      DOC_PROD_RELEASE_ROOT: readScriptEnv(app, env, nestedEnv, "DOC_PROD_RELEASE_ROOT"),
      DOC_PROD_STATE_ROOT: readScriptEnv(app, env, nestedEnv, "DOC_PROD_STATE_ROOT"),
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
      failures.push(`PM2 app ${expectedApp.name} args are ${JSON.stringify(actualArgs)}; expected ${JSON.stringify(expectedApp.args)}`);
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
        failures.push(`PM2 app ${expectedApp.name} env.${key} is ${actualRuntimeEnv[key] ?? "missing"}; expected ${expectedValue}`);
      }
    }
  }

  return failures;
}

async function verifyPm2Runtime(expectedApps) {
  if (dryRun) return;
  const parsed = await readPm2List();
  const failures = collectPm2RuntimeFailures(parsed, expectedApps);
  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }
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
  if (dryRun) return;
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
}

async function ensureDir(dirPath) {
  if (!dryRun) {
    await mkdir(dirPath, { recursive: true });
  }
}

async function removePathIfExists(targetPath) {
  if (dryRun) return;
  await rm(targetPath, { recursive: true, force: true });
}

async function ensureSymlink(linkPath, targetPath) {
  if (dryRun) return;
  const existing = await lstat(linkPath).catch(() => null);
  if (existing) {
    await rm(linkPath, { recursive: true, force: true });
  }
  await symlink(targetPath, linkPath);
}

async function verifyLinkedPath(linkPath, expectedTarget) {
  const stats = await lstat(linkPath);
  if (!stats.isSymbolicLink()) {
    throw new Error(`${linkPath} must be a symlink to ${expectedTarget}`);
  }
  const resolved = normalizePath(path.resolve(path.dirname(linkPath), await readlink(linkPath)));
  if (!samePath(resolved, expectedTarget)) {
    throw new Error(`${linkPath} points to ${resolved}; expected ${expectedTarget}`);
  }
}

async function ensureDurableEnvLinks(targetRoot) {
  const apiEnvPath = path.join(targetRoot, "apps", "api", ".env");
  const webEnvPath = path.join(targetRoot, "apps", "web", ".env.local");

  await ensureSymlink(apiEnvPath, productionConfig.durableApiEnvPath);
  await ensureSymlink(webEnvPath, productionConfig.durableWebEnvPath);

  if (!dryRun) {
    await verifyLinkedPath(apiEnvPath, productionConfig.durableApiEnvPath);
    await verifyLinkedPath(webEnvPath, productionConfig.durableWebEnvPath);
  }
}

function assertCanonicalSource() {
  if (!deploySource.ok) {
    throw new Error(deploySource.failures.join(" | "));
  }
  if (!samePath(repoRoot, productionConfig.canonicalSourceRoot)) {
    throw new Error(`deploy must run from canonical source path ${productionConfig.canonicalSourceRoot}, not ${repoRoot}`);
  }
}

function assertCleanGitSource() {
  if (buildMeta.sha === "unknown") {
    throw new Error("Unable to resolve build SHA. Fix git resolution before deploying.");
  }
  if (sourceGitState.dirty && !allowDirty) {
    throw new Error(`canonical source working tree is dirty: ${sourceGitState.dirtyEntries.join(", ")}`);
  }
}

function assertOriginBranchPinned() {
  const fetchResult = runGit(["fetch", "origin", "--prune"], { cwd: repoRoot });
  if (fetchResult.status !== 0) {
    throw new Error(`git fetch origin --prune failed: ${fetchResult.stderr.trim() || fetchResult.stdout.trim()}`);
  }
  const remoteHead = runGit(["rev-parse", `origin/${productionConfig.canonicalBranch}`], { cwd: repoRoot });
  if (remoteHead.status !== 0) {
    throw new Error(`origin/${productionConfig.canonicalBranch} could not be resolved from canonical source`);
  }
  if (remoteHead.stdout.trim() !== buildMeta.sha) {
    throw new Error(`canonical source HEAD ${buildMeta.sha} does not match origin/${productionConfig.canonicalBranch} ${remoteHead.stdout.trim()}`);
  }
}

async function assertDurableEnvSourcesExist() {
  const durablePaths = [productionConfig.durableApiEnvPath, productionConfig.durableWebEnvPath];
  for (const durablePath of durablePaths) {
    try {
      await lstat(durablePath);
    } catch {
      throw new Error(`durable env source is missing: ${durablePath}`);
    }
  }
}

async function assertExistingPm2RuntimePathsAllowed() {
  if (dryRun) return;
  const pm2Apps = await readPm2List();
  const failures = [];
  const bootstrapWarnings = [];
  for (const app of pm2Apps) {
    if (!targetPm2Apps.some((candidate) => candidate.name === app.name)) continue;
    const actualCwd = app.pm_cwd ?? app.cwd ?? app.pm2_env?.pm_cwd ?? app.pm2_env?.cwd;
    if (!actualCwd) continue;
    const legacyRuntimeRoot = productionConfig.legacyRuntimeRoots.find((legacyRoot) =>
      pathWithin(legacyRoot, actualCwd)
    );
    const allowed =
      pathWithin(productionConfig.releasesRoot, actualCwd) ||
      pathWithin(productionConfig.canonicalSourceRoot, actualCwd) ||
      (allowLegacyRuntimeBootstrap && legacyRuntimeRoot);
    if (!allowed) {
      failures.push(`${app.name} is running from unexpected path ${actualCwd}`);
      continue;
    }
    if (legacyRuntimeRoot) {
      bootstrapWarnings.push(`${app.name} is still running from legacy runtime path ${actualCwd}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }
  if (bootstrapWarnings.length > 0) {
    for (const warning of bootstrapWarnings) {
      printWarn(`${warning}; continuing only because --allow-legacy-runtime-bootstrap was provided.`);
    }
  }
}

async function createReleaseWorktree() {
  await ensureDir(productionConfig.releasesRoot);
  await ensureDir(productionConfig.pm2LogRoot);
  await ensureDir(productionConfig.smokeLogRoot);
  await removePathIfExists(releaseRoot);

  await run("git", ["worktree", "add", "--detach", "--force", releaseRoot, buildMeta.sha], {
    cwd: repoRoot,
  });
  await ensureDurableEnvLinks(releaseRoot);
}

async function buildRelease() {
  await ensureWorkspaceDependencies(releaseRoot);
  await run("pnpm", ["--dir", "apps/api", "exec", "prisma", "generate"], { cwd: releaseRoot });
  await run("pnpm", ["--dir", "apps/api", "exec", "prisma", "migrate", "deploy"], { cwd: releaseRoot });
  await run("pnpm", ["--dir", "apps/api", "build"], { cwd: releaseRoot });
  await run("pnpm", ["--dir", "apps/web", "build"], { cwd: releaseRoot });
}

async function verifyReleaseBuild() {
  const deployConfig = await verifyDeployConfig({
    requireBuilt: true,
    expectedSha: buildMeta.sha,
    expectedVersionLabel: buildMeta.versionLabel,
    repoRootOverride: releaseRoot,
    skipCanonicalSourceCheck: true,
  });
  if (deployConfig.failures.length > 0) {
    throw new Error(`deploy config verification failed: ${deployConfig.failures.join(" | ")}`);
  }
  for (const warning of deployConfig.warnings) {
    printWarn(warning);
  }
}

async function replacePm2Apps(expectedApps) {
  if (dryRun) return;
  const parsed = await readPm2List();
  const existingAppNames = expectedApps
    .map((expectedApp) => expectedApp.name)
    .filter((appName) => parsed.some((entry) => entry.name === appName));

  if (existingAppNames.length > 0) {
    await run("pm2", ["delete", ...existingAppNames], { cwd: releaseRoot });
  }
  await run("pm2", ["start", "ecosystem.config.cjs"], {
    cwd: releaseRoot,
  });
  await waitForPm2AppsOnline(expectedApps);
  await verifyPm2Runtime(expectedApps);
}

async function verifyLiveVersions() {
  const targets = {
    localhostApi: await fetchVersionInfo("http://127.0.0.1:4000"),
    localhostWeb: await fetchVersionInfo("http://127.0.0.1:3000"),
    publicApi: await fetchVersionInfo("https://api.onyxintels.com/api/version"),
    publicWeb: await fetchVersionInfo("https://onyxintels.com/version"),
  };

  const failures = [];
  for (const [label, version] of Object.entries(targets)) {
    if (version.commitHash !== buildMeta.sha) {
      failures.push(`${label} commitHash ${version.commitHash} does not match deployed commit ${buildMeta.sha}`);
    }
    if (version.shortCommitHash !== buildMeta.shortSha) {
      failures.push(`${label} shortCommitHash ${version.shortCommitHash ?? "unknown"} does not match deployed short SHA ${buildMeta.shortSha}`);
    }
    if (version.buildSource !== buildMeta.source) {
      failures.push(`${label} buildSource ${version.buildSource ?? "unknown"} does not match deployed source ${buildMeta.source}`);
    }
    if (!allowDirty && version.buildDirty !== false) {
      failures.push(`${label} buildDirty is ${version.buildDirty ?? "unknown"} instead of false`);
    }
  }

  const webApiPairs = [
    ["localhost", targets.localhostApi, targets.localhostWeb],
    ["public", targets.publicApi, targets.publicWeb],
  ];
  for (const [label, apiVersion, webVersion] of webApiPairs) {
    if (apiVersion.commitHash !== webVersion.commitHash) {
      failures.push(`${label} API/web commitHash mismatch (${apiVersion.commitHash} vs ${webVersion.commitHash})`);
    }
    if (apiVersion.versionLabel !== webVersion.versionLabel) {
      failures.push(`${label} API/web versionLabel mismatch (${apiVersion.versionLabel} vs ${webVersion.versionLabel})`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }

  return targets;
}

async function assertNoOpenAiRuntimeWarning() {
  if (dryRun) return;
  const apiLogFiles = [
    path.join(productionConfig.pm2LogRoot, "api-out.log"),
    path.join(productionConfig.pm2LogRoot, "api-error.log"),
  ];
  const blockedMarkers = [
    "OPENAI_API_KEY is not set",
    "OPENAI_API_KEY not configured",
  ];

  for (const logFile of apiLogFiles) {
    const content = await readFile(logFile, "utf8").catch(() => "");
    const tail = content.slice(-20_000);
    for (const marker of blockedMarkers) {
      if (tail.includes(marker)) {
        throw new Error(`API log ${logFile} still contains runtime OPENAI warning: ${marker}`);
      }
    }
  }
}

async function main() {
  logStep("resolved deploy metadata", {
    buildMeta,
    canonicalSourceRoot: productionConfig.canonicalSourceRoot,
    releaseRoot,
  });

  assertCanonicalSource();
  assertCleanGitSource();
  assertOriginBranchPinned();
  await assertDurableEnvSourcesExist();
  await ensureDurableEnvLinks(repoRoot);
  await ensureWorkspaceDependencies(repoRoot);
  await assertExistingPm2RuntimePathsAllowed();

  const checklistArgs = [];
  if (allowDirty) checklistArgs.push("--allow-dirty");
  if (allowStaleMeta) checklistArgs.push("--allow-stale-meta");
  await runChecklist(checklistArgs);

  await createReleaseWorktree();
  await buildRelease();
  await verifyReleaseBuild();
  const pendingRecord = {
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
    command: "pnpm deploy:production",
    sourceRoot: repoRoot,
    sourceRemote: deploySource.remoteUrl,
    releaseRoot,
    durableEnv: {
      api: productionConfig.durableApiEnvPath,
      web: productionConfig.durableWebEnvPath,
    },
    allowDirty,
    allowStaleMeta,
    allowLegacyRuntimeBootstrap,
    status: "deploying",
  };
  await writeLatestDeployRecord(pendingRecord, { config: productionConfig });
  await replacePm2Apps(targetPm2Apps);
  await waitForHealth("http://127.0.0.1:4000/health", "API");
  await waitForHealth("http://127.0.0.1:3000/healthz", "web");

  if (dryRun) {
    printPass(`dry run completed for release ${releaseRoot}`);
    return;
  }

  const liveVersions = await verifyLiveVersions();
  await assertNoOpenAiRuntimeWarning();
  await runLocalNodeScript("production-demand-smoke.mjs", [], { cwd: releaseRoot });
  await run("node", [path.join("scripts", "production-runtime-guard.mjs")], { cwd: releaseRoot });
  await run("pm2", ["save"], { cwd: releaseRoot });
  await verifyPm2SavedState(targetPm2Apps);
  await runLocalNodeScript(
    "check-running-version.mjs",
    [
      "--expect-sha",
      buildMeta.sha,
      "--expect-short-sha",
      buildMeta.shortSha,
      "--expect-version-label",
      buildMeta.versionLabel,
      "--expect-build-source",
      buildMeta.source,
      "--expect-build-dirty",
      allowDirty ? "true" : "false",
      "--require-services",
      "api,web",
      "http://127.0.0.1:4000",
      "http://127.0.0.1:3000",
      "https://api.onyxintels.com/api/version",
      "https://onyxintels.com/version",
    ],
    { cwd: releaseRoot }
  );

  const record = {
    ...pendingRecord,
    status: "ready",
    live: {
      localhostApi: liveVersions.localhostApi,
      localhostWeb: liveVersions.localhostWeb,
      publicApi: liveVersions.publicApi,
      publicWeb: liveVersions.publicWeb,
    },
  };
  await appendDeployRecord(record, { config: productionConfig });

  printPass(
    `production is serving release ${releaseRoot} from canonical source ${repoRoot} at commit ${buildMeta.sha}`
  );
}

main().catch((error) => {
  printFail(
    error instanceof Error ? error.message : String(error),
    "Fix the failing deploy guard and rerun pnpm deploy:production from the canonical GitHub-backed source."
  );
  process.exit(1);
});
