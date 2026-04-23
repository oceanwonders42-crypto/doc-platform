import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import { readLatestDeployRecord } from "./deploy-lib.mjs";
import { normalizePath, resolveProductionReleaseConfig } from "./production-release-config.mjs";

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function computeVersionLabel(build) {
  const branchLabel = typeof build.branch === "string" && build.branch.trim() ? build.branch.trim() : "detached";
  const shortSha = typeof build.shortSha === "string" && build.shortSha.trim() ? build.shortSha.trim() : "unknown";
  return `${branchLabel}@${shortSha}${build.dirty === true ? "-dirty" : ""}`;
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function samePath(left, right) {
  return normalizePath(left) === normalizePath(right);
}

function readBuildInfo(cwd) {
  const buildMetaPath = path.join(cwd, "build-meta.json");
  const buildMeta = readJson(buildMetaPath);
  const packageMeta = readJson(path.join(cwd, "package.json")) ?? {};
  const sha =
    (typeof buildMeta?.sha === "string" && buildMeta.sha.trim() && buildMeta.sha.trim()) ||
    process.env.DOC_BUILD_SHA?.trim() ||
    process.env.SOURCE_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    "unknown";
  return {
    buildMetaPath,
    hasBuildMeta: buildMeta != null && typeof buildMeta === "object",
    packageName:
      (typeof packageMeta.name === "string" && packageMeta.name.trim() && packageMeta.name.trim()) || "unknown",
    packageVersion:
      (typeof packageMeta.version === "string" && packageMeta.version.trim() && packageMeta.version.trim()) ||
      "unknown",
    sha,
    shortSha:
      (typeof buildMeta?.shortSha === "string" && buildMeta.shortSha.trim() && buildMeta.shortSha.trim()) ||
      (sha === "unknown" ? "unknown" : sha.slice(0, 12)),
    buildState:
      (typeof buildMeta?.buildState === "string" && buildMeta.buildState.trim() && buildMeta.buildState.trim()) ||
      null,
    buildStartedAt:
      (typeof buildMeta?.buildStartedAt === "string" && buildMeta.buildStartedAt.trim() && buildMeta.buildStartedAt.trim()) ||
      null,
    builtAt:
      (typeof buildMeta?.builtAt === "string" && buildMeta.builtAt.trim() && buildMeta.builtAt.trim()) ||
      process.env.DOC_BUILD_TIMESTAMP?.trim() ||
      null,
    source:
      (typeof buildMeta?.source === "string" && buildMeta.source.trim() && buildMeta.source.trim()) ||
      process.env.DOC_BUILD_SOURCE?.trim() ||
      "runtime-env",
    branch:
      (typeof buildMeta?.branch === "string" && buildMeta.branch.trim() && buildMeta.branch.trim()) ||
      process.env.DOC_BUILD_BRANCH?.trim() ||
      null,
    dirty:
      typeof buildMeta?.dirty === "boolean"
        ? buildMeta.dirty
        : process.env.DOC_BUILD_DIRTY?.trim() === "true"
          ? true
          : process.env.DOC_BUILD_DIRTY?.trim() === "false"
            ? false
            : null,
  };
}

function collectStartupGuards(service, build) {
  const errors = [];
  const warnings = [];
  const allowAmbiguousBuildState = readEnv("DOC_ALLOW_AMBIGUOUS_BUILD_STATE") === "true";

  if (!build.hasBuildMeta) {
    errors.push(`build-meta.json is missing at ${build.buildMetaPath}.`);
  }

  if (build.hasBuildMeta && build.buildState !== "complete") {
    errors.push(
      `build-meta.json state is ${build.buildState ?? "unknown"}; expected complete. The previous build likely did not finish cleanly.`
    );
  }

  const missingBuildFields = [];
  if (build.hasBuildMeta && build.sha === "unknown") missingBuildFields.push("sha");
  if (build.hasBuildMeta && build.shortSha === "unknown") missingBuildFields.push("shortSha");
  if (build.hasBuildMeta && !build.buildStartedAt) missingBuildFields.push("buildStartedAt");
  if (build.hasBuildMeta && !build.builtAt) missingBuildFields.push("builtAt");
  if (build.hasBuildMeta && (!build.source || build.source === "runtime-env")) missingBuildFields.push("source");
  if (build.hasBuildMeta && !build.branch) missingBuildFields.push("branch");
  if (build.hasBuildMeta && build.dirty === null) missingBuildFields.push("dirty");

  if (missingBuildFields.length > 0) {
    errors.push(`build-meta.json is missing required completed-build fields: ${missingBuildFields.join(", ")}.`);
  }

  if (build.hasBuildMeta && build.dirty === true) {
    warnings.push(`Dirty build metadata detected for ${service} (${computeVersionLabel(build)}).`);
  }

  if (process.env.NODE_ENV !== "production") {
    return { errors, warnings, allowAmbiguousBuildState };
  }

  const expectedSha = readEnv("DOC_BUILD_SHA") || readEnv("SOURCE_VERSION") || readEnv("VERCEL_GIT_COMMIT_SHA");
  if (expectedSha && build.sha !== "unknown" && expectedSha !== build.sha) {
    errors.push(`Build SHA mismatch: startup expected ${expectedSha}, but ${service} resolved ${build.sha}.`);
  }

  if (!expectedSha && build.sha === "unknown") {
    warnings.push(`Build SHA is unknown for ${service}; startup cannot verify that runtime code matches the intended release.`);
  }

  if ((service === "api" || service === "worker") && !readEnv("DATABASE_URL")) {
    errors.push(`DATABASE_URL is missing; ${service} cannot safely start in production.`);
  }

  if ((service === "api" || service === "worker") && !readEnv("REDIS_URL")) {
    warnings.push(`REDIS_URL is unset; ${service} may fall back to redis://localhost:6379.`);
  }

  if (service === "web" && !readEnv("DOC_API_URL")) {
    warnings.push("DOC_API_URL is unset; server-rendered web API calls will fail.");
  }

  if (service === "web" && !readEnv("DOC_API_KEY")) {
    warnings.push("DOC_API_KEY is unset; authenticated web-to-API server calls will fail.");
  }

  return { errors, warnings, allowAmbiguousBuildState };
}

function inspectDurableEnvLink(filePath, expectedTarget) {
  try {
    const stats = lstatSync(filePath);
    if (!stats.isSymbolicLink()) {
      return { ok: false, reason: "not_a_symlink" };
    }
    const actualTarget = normalizePath(realpathSync(filePath));
    return {
      ok: samePath(actualTarget, expectedTarget),
      reason: samePath(actualTarget, expectedTarget) ? null : `wrong_target:${actualTarget}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function collectRuntimeLockErrors(service, cwd, build) {
  const errors = [];
  if (process.env.NODE_ENV !== "production") {
    return errors;
  }
  if (readEnv("DOC_RUNTIME_RELEASE_LOCK") === "false") {
    return errors;
  }

  const runtimeReleaseRoot = path.dirname(path.dirname(cwd));
  const runtimeConfig = resolveProductionReleaseConfig({ repoRoot: runtimeReleaseRoot });
  const latest = await readLatestDeployRecord({ config: runtimeConfig });
  if (!latest || typeof latest !== "object") {
    errors.push(`latest deploy metadata is missing at ${runtimeConfig.latestDeployFile}`);
    return errors;
  }

  if (!samePath(runtimeReleaseRoot, latest.releaseRoot)) {
    errors.push(`runtime release root ${runtimeReleaseRoot} does not match recorded release ${latest.releaseRoot}`);
  }

  if (build.sha !== "unknown" && latest.commitSha && build.sha !== latest.commitSha) {
    errors.push(`runtime build SHA ${build.sha} does not match recorded release commit ${latest.commitSha}`);
  }

  const runtimeApiEnv = inspectDurableEnvLink(
    path.join(runtimeReleaseRoot, "apps", "api", ".env"),
    runtimeConfig.durableApiEnvPath
  );
  if (!runtimeApiEnv.ok) {
    errors.push(`API env linkage drifted (${runtimeApiEnv.reason})`);
  }

  const runtimeWebEnv = inspectDurableEnvLink(
    path.join(runtimeReleaseRoot, "apps", "web", ".env.local"),
    runtimeConfig.durableWebEnvPath
  );
  if (!runtimeWebEnv.ok) {
    errors.push(`web env linkage drifted (${runtimeWebEnv.reason})`);
  }

  if (service === "api" || service === "worker") {
    const expectedReleaseRoot = readEnv("DOC_PROD_RELEASE_ROOT");
    if (expectedReleaseRoot && !samePath(runtimeReleaseRoot, expectedReleaseRoot)) {
      errors.push(`runtime release root ${runtimeReleaseRoot} does not match DOC_PROD_RELEASE_ROOT ${expectedReleaseRoot}`);
    }
  }

  return errors;
}

const [service, command, ...args] = process.argv.slice(2);

if (!service || !command) {
  console.error("Usage: node scripts/start-service-with-build-info.mjs <service> <command> [args...]");
  process.exit(1);
}

const cwd = process.cwd();
const build = readBuildInfo(cwd);

console.log("[startup] version", {
  service,
  versionLabel: computeVersionLabel(build),
  packageVersion: build.packageVersion,
  commitHash: build.sha,
  shortCommitHash: build.shortSha,
  buildState: build.buildState,
  buildStartedAt: build.buildStartedAt,
  buildTime: build.builtAt,
  buildSource: build.source,
  buildBranch: build.branch,
  buildDirty: build.dirty,
  buildMetaPath: build.buildMetaPath,
  cwd,
});
console.log(`[startup] Running commit: ${build.sha}`);

const startupGuards = collectStartupGuards(service, build);
startupGuards.warnings.forEach((warning) => {
  console.warn(`[startup] CRITICAL ${warning}`);
});

const runtimeLockErrors = await collectRuntimeLockErrors(service, cwd, build);
runtimeLockErrors.forEach((error) => {
  console.error(`[startup] FATAL runtime lock ${error}`);
});

if (startupGuards.errors.length > 0 || runtimeLockErrors.length > 0) {
  const allErrors = [...startupGuards.errors, ...runtimeLockErrors];
  startupGuards.errors.forEach((error) => {
    console.error(`[startup] FATAL ${error}`);
  });
  console.error("[startup] refusing to start", {
    service,
    errors: allErrors,
    buildMetaPath: build.buildMetaPath,
    allowAmbiguousBuildState: startupGuards.allowAmbiguousBuildState,
  });
  if (!startupGuards.allowAmbiguousBuildState) {
    process.exit(1);
  }
  console.error(
    "[startup] override active; continuing despite ambiguous build metadata because DOC_ALLOW_AMBIGUOUS_BUILD_STATE=true"
  );
}

const child = spawn(command, args, {
  cwd,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[startup] failed to launch child process", error);
  process.exit(1);
});
