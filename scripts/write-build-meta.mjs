import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeVersionLabel } from "./deploy-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const rawArgs = process.argv.slice(2);
let targetArg = ".";
let buildState = "complete";

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];

  if (arg === "--state") {
    buildState = rawArgs[index + 1] ?? buildState;
    index += 1;
    continue;
  }

  if (arg.startsWith("--state=")) {
    buildState = arg.slice("--state=".length) || buildState;
    continue;
  }

  if (!arg.startsWith("--") && targetArg === ".") {
    targetArg = arg;
  }
}

const targetDir = path.resolve(process.cwd(), targetArg);
const normalizedBuildState = buildState === "pending" ? "pending" : "complete";

async function readExistingBuildMeta(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

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
    return {
      dirty: null,
      dirtyEntries: [],
    };
  }
  const dirtyEntries = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    dirty: dirtyEntries.length > 0,
    dirtyEntries,
  };
}

const sha =
  process.env.DOC_BUILD_SHA?.trim() ||
  process.env.SOURCE_VERSION?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  resolveGitSha();
const dirtyWorktree = resolveDirtyWorktree();
const buildMetaPath = path.join(targetDir, "build-meta.json");
const existingBuildMeta = await readExistingBuildMeta(buildMetaPath);
const timestamp = process.env.DOC_BUILD_TIMESTAMP?.trim() || new Date().toISOString();
const buildStartedAt =
  normalizedBuildState === "pending"
    ? timestamp
    : typeof existingBuildMeta?.buildStartedAt === "string" && existingBuildMeta.buildStartedAt.trim()
      ? existingBuildMeta.buildStartedAt.trim()
      : timestamp;

const payload = {
  sha,
  shortSha: sha === "unknown" ? "unknown" : sha.slice(0, 12),
  buildState: normalizedBuildState,
  buildStartedAt,
  builtAt: normalizedBuildState === "complete" ? timestamp : null,
  source: process.env.DOC_BUILD_SOURCE?.trim() || "build-script",
  branch: process.env.DOC_BUILD_BRANCH?.trim() || resolveGitBranch(),
  dirty:
    process.env.DOC_BUILD_DIRTY?.trim() === "true"
      ? true
      : process.env.DOC_BUILD_DIRTY?.trim() === "false"
        ? false
        : dirtyWorktree.dirty,
  dirtyEntryCount: dirtyWorktree.dirtyEntries.length,
  dirtyEntriesSample: dirtyWorktree.dirtyEntries.slice(0, 10),
};

payload.versionLabel = computeVersionLabel({
  branch: payload.branch,
  shortSha: payload.shortSha,
  dirty: payload.dirty,
});

await mkdir(targetDir, { recursive: true });
await writeFile(buildMetaPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[build-meta] wrote ${buildMetaPath}`, payload);
