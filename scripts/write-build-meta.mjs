import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeVersionLabel } from "./deploy-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const targetArg = process.argv[2] ?? ".";
const targetDir = path.resolve(process.cwd(), targetArg);

function resolveGitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function resolveGitBranch() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function resolveDirtyWorktree() {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim().length > 0;
}

const sha =
  process.env.DOC_BUILD_SHA?.trim() ||
  process.env.SOURCE_VERSION?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  resolveGitSha();

const payload = {
  sha,
  shortSha: sha === "unknown" ? "unknown" : sha.slice(0, 12),
  builtAt: process.env.DOC_BUILD_TIMESTAMP?.trim() || new Date().toISOString(),
  source: process.env.DOC_BUILD_SOURCE?.trim() || "build-script",
  branch: process.env.DOC_BUILD_BRANCH?.trim() || resolveGitBranch(),
  dirty:
    process.env.DOC_BUILD_DIRTY?.trim() === "true"
      ? true
      : process.env.DOC_BUILD_DIRTY?.trim() === "false"
        ? false
        : resolveDirtyWorktree(),
};

payload.versionLabel = computeVersionLabel({
  branch: payload.branch,
  shortSha: payload.shortSha,
  dirty: payload.dirty,
});

await mkdir(targetDir, { recursive: true });
await writeFile(path.join(targetDir, "build-meta.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[build-meta] wrote ${path.join(targetDir, "build-meta.json")}`, payload);
