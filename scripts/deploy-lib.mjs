import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.dirname(scriptDir);
export const deployLogDir = path.join(repoRoot, "logs", "deploy");
export const deployHistoryFile = path.join(deployLogDir, "history.jsonl");
export const latestDeployFile = path.join(deployLogDir, "latest.json");

export function runGit(args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

export function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

export function computeVersionLabel({ branch, shortSha, dirty }) {
  const branchLabel = readString(branch) ?? "detached";
  const shortLabel = readString(shortSha) ?? "unknown";
  return `${branchLabel}@${shortLabel}${dirty === true ? "-dirty" : ""}`;
}

export function resolveGitState() {
  const shaResult = runGit(["rev-parse", "HEAD"]);
  const branchResult = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const statusResult = runGit(["status", "--short"]);

  const sha = shaResult.status === 0 ? shaResult.stdout.trim() : "unknown";
  const branch = branchResult.status === 0 ? branchResult.stdout.trim() : "unknown";
  const dirtyEntries =
    statusResult.status === 0
      ? statusResult.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [];

  return {
    sha,
    shortSha: sha === "unknown" ? "unknown" : sha.slice(0, 12),
    branch,
    dirty: dirtyEntries.length > 0,
    dirtyEntries,
    versionLabel: computeVersionLabel({
      branch,
      shortSha: sha === "unknown" ? "unknown" : sha.slice(0, 12),
      dirty: dirtyEntries.length > 0,
    }),
  };
}

export function gitCommitExists(commitish) {
  const commit = readString(commitish);
  if (!commit) return false;
  const result = runGit(["cat-file", "-e", `${commit}^{commit}`]);
  return result.status === 0;
}

export function gitCommitInHistory(commitish) {
  const commit = readString(commitish);
  if (!commit) return false;
  const result = runGit(["rev-list", "--all", "--max-count=1", commit]);
  return result.status === 0 && result.stdout.trim().length > 0;
}

export function inspectDeploySource(gitState = resolveGitState()) {
  const failures = [];
  const warnings = [];

  if (gitState.sha === "unknown") {
    failures.push("git rev-parse HEAD failed; this checkout is missing commit metadata.");
  }

  if (gitState.branch === "unknown") {
    failures.push("git branch could not be resolved; this looks like a bundle-style checkout rather than a tracked release.");
  }

  if (gitState.sha !== "unknown" && !gitCommitExists(gitState.sha)) {
    failures.push(`commit ${gitState.sha} is not present as a git commit object in this checkout.`);
  }

  if (gitState.sha !== "unknown" && !gitCommitInHistory(gitState.sha)) {
    failures.push(`commit ${gitState.sha} is not reachable from local git history.`);
  }

  if (gitState.dirty) {
    warnings.push(`git status is dirty (${gitState.dirtyEntries.length} entries).`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    gitState,
    bundleDetected: failures.some((entry) => /bundle-style checkout|missing commit metadata/.test(entry)),
  };
}

export async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readBuildMeta(appDir) {
  const buildMetaPath = path.join(appDir, "build-meta.json");
  const parsed = await readJson(buildMetaPath);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const sha = readString(parsed.sha);
  const shortSha = readString(parsed.shortSha);
  const builtAt = readString(parsed.builtAt);
  const source = readString(parsed.source);
  const branch = readString(parsed.branch);
  const dirty = readBoolean(parsed.dirty);
  const versionLabel =
    readString(parsed.versionLabel) ??
    computeVersionLabel({
      branch,
      shortSha,
      dirty,
    });

  return {
    path: buildMetaPath,
    sha,
    shortSha,
    builtAt,
    source,
    branch,
    dirty,
    versionLabel,
  };
}

export function assessBuildMeta(service, buildMeta, gitState, options = {}) {
  const allowDirty = options.allowDirty === true;
  const failures = [];
  const warnings = [];

  if (!buildMeta) {
    failures.push(`${service} build-meta.json is missing`);
    return { failures, warnings };
  }

  const missingFields = [];
  if (!buildMeta.sha) missingFields.push("sha");
  if (!buildMeta.shortSha) missingFields.push("shortSha");
  if (!buildMeta.builtAt) missingFields.push("builtAt");
  if (!buildMeta.source) missingFields.push("source");
  if (!buildMeta.branch) missingFields.push("branch");
  if (buildMeta.dirty === null) missingFields.push("dirty");

  if (missingFields.length > 0) {
    failures.push(`${service} build-meta.json is missing required fields: ${missingFields.join(", ")}`);
  }

  if (buildMeta.sha && gitState.sha !== "unknown" && buildMeta.sha !== gitState.sha) {
    failures.push(`${service} build-meta.json commit does not match HEAD (${buildMeta.sha} != ${gitState.sha})`);
  }

  if (buildMeta.shortSha && gitState.shortSha !== "unknown" && buildMeta.shortSha !== gitState.shortSha) {
    failures.push(`${service} build-meta.json shortSha does not match HEAD (${buildMeta.shortSha} != ${gitState.shortSha})`);
  }

  if (buildMeta.dirty === true && !allowDirty) {
    failures.push(`${service} build-meta.json reports dirty=true`);
  }

  const expectedVersionLabel = computeVersionLabel({
    branch: gitState.branch,
    shortSha: gitState.shortSha,
    dirty: allowDirty ? gitState.dirty : false,
  });
  if (buildMeta.versionLabel && buildMeta.versionLabel !== expectedVersionLabel) {
    warnings.push(
      `${service} build-meta.json versionLabel is ${buildMeta.versionLabel}; expected ${expectedVersionLabel}`
    );
  }

  return { failures, warnings };
}

export function normalizeVersionUrl(input) {
  const url = new URL(input);
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname === "" ? "/version" : pathname.endsWith("/version") ? pathname : `${pathname}/version`;
  return url.toString();
}

export function commitsMatch(expectedCommit, runningCommit) {
  if (!expectedCommit || !runningCommit || expectedCommit === "unknown" || runningCommit === "unknown") {
    return false;
  }

  return (
    expectedCommit === runningCommit ||
    (runningCommit.length >= 7 && expectedCommit.startsWith(runningCommit)) ||
    (expectedCommit.length >= 7 && runningCommit.startsWith(expectedCommit))
  );
}

export function extractVersionInfo(payload, url) {
  const build = payload?.build && typeof payload.build === "object" ? payload.build : {};
  const commitHash =
    readString(payload?.commitHash) ||
    readString(build?.sha) ||
    readString(payload?.sha) ||
    "unknown";
  const shortCommitHash =
    readString(payload?.shortCommitHash) ||
    readString(build?.shortSha) ||
    readString(payload?.shortSha) ||
    (commitHash === "unknown" ? null : commitHash.slice(0, 12));
  const buildDirty =
    readBoolean(payload?.buildDirty) ??
    readBoolean(build?.dirty) ??
    readBoolean(payload?.dirty);
  const buildBranch =
    readString(payload?.buildBranch) ||
    readString(build?.branch) ||
    readString(payload?.branch);

  return {
    url,
    service: readString(payload?.service) || "unknown",
    versionLabel:
      readString(payload?.versionLabel) ||
      computeVersionLabel({
        branch: buildBranch,
        shortSha: shortCommitHash,
        dirty: buildDirty,
      }),
    packageName: readString(payload?.packageName) || readString(build?.packageName) || "unknown",
    packageVersion: readString(payload?.packageVersion) || readString(build?.packageVersion) || "unknown",
    commitHash,
    shortCommitHash,
    buildTime:
      readString(payload?.buildTime) ||
      readString(build?.builtAt) ||
      readString(payload?.builtAt),
    buildSource:
      readString(payload?.buildSource) ||
      readString(build?.source) ||
      readString(payload?.source),
    buildBranch,
    buildDirty,
    nodeEnv: readString(payload?.nodeEnv),
  };
}

export async function fetchVersionInfo(target) {
  const versionUrl = normalizeVersionUrl(target);
  const response = await fetch(versionUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`${versionUrl} responded with ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return extractVersionInfo(payload, versionUrl);
}

export async function appendDeployRecord(record) {
  await mkdir(deployLogDir, { recursive: true });
  await appendFile(deployHistoryFile, `${JSON.stringify(record)}\n`, "utf8");
  await writeFile(latestDeployFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function readDeployHistory(limit = 10) {
  const raw = await readFile(deployHistoryFile, "utf8").catch(() => "");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(-limit)
    .reverse();
}

export function printPass(message) {
  console.log(`PASS: ${message}`);
}

export function printWarn(message) {
  console.warn(`WARN: ${message}`);
}

export function printFail(message, nextAction) {
  console.error(`FAIL: ${message}`);
  if (nextAction) {
    console.error(`NEXT: ${nextAction}`);
  }
}
