import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

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

function readBuildInfo(cwd) {
  const buildMeta = readJson(path.join(cwd, "build-meta.json")) ?? {};
  const packageMeta = readJson(path.join(cwd, "package.json")) ?? {};
  const sha =
    (typeof buildMeta.sha === "string" && buildMeta.sha.trim() && buildMeta.sha.trim()) ||
    process.env.DOC_BUILD_SHA?.trim() ||
    process.env.SOURCE_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    "unknown";
  return {
    packageName:
      (typeof packageMeta.name === "string" && packageMeta.name.trim() && packageMeta.name.trim()) || "unknown",
    packageVersion:
      (typeof packageMeta.version === "string" && packageMeta.version.trim() && packageMeta.version.trim()) ||
      "unknown",
    sha,
    shortSha:
      (typeof buildMeta.shortSha === "string" && buildMeta.shortSha.trim() && buildMeta.shortSha.trim()) ||
      (sha === "unknown" ? "unknown" : sha.slice(0, 12)),
    builtAt:
      (typeof buildMeta.builtAt === "string" && buildMeta.builtAt.trim() && buildMeta.builtAt.trim()) ||
      process.env.DOC_BUILD_TIMESTAMP?.trim() ||
      null,
    source:
      (typeof buildMeta.source === "string" && buildMeta.source.trim() && buildMeta.source.trim()) ||
      process.env.DOC_BUILD_SOURCE?.trim() ||
      "runtime-env",
    branch:
      (typeof buildMeta.branch === "string" && buildMeta.branch.trim() && buildMeta.branch.trim()) ||
      process.env.DOC_BUILD_BRANCH?.trim() ||
      null,
    dirty:
      typeof buildMeta.dirty === "boolean"
        ? buildMeta.dirty
        : process.env.DOC_BUILD_DIRTY?.trim() === "true"
          ? true
          : process.env.DOC_BUILD_DIRTY?.trim() === "false"
            ? false
            : null,
  };
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
  buildTime: build.builtAt,
  buildSource: build.source,
  buildBranch: build.branch,
  buildDirty: build.dirty,
  cwd,
});

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
