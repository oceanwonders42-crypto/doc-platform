import { readFileSync } from "node:fs";
import path from "node:path";

export type BuildInfo = {
  sha: string;
  shortSha: string;
  versionLabel: string;
  builtAt: string | null;
  source: string;
  branch: string | null;
  dirty: boolean | null;
  packageName: string;
  packageVersion: string;
};

type BuildMetaFile = {
  sha?: unknown;
  shortSha?: unknown;
  versionLabel?: unknown;
  builtAt?: unknown;
  source?: unknown;
  branch?: unknown;
  dirty?: unknown;
};

type PackageMeta = {
  name?: unknown;
  version?: unknown;
};

function getShortSha(sha: string) {
  return sha === "unknown" ? "unknown" : sha.slice(0, 12);
}

function computeVersionLabel(branch: string | null, shortSha: string, dirty: boolean | null) {
  const branchLabel = branch?.trim() || "detached";
  return `${branchLabel}@${shortSha}${dirty === true ? "-dirty" : ""}`;
}

function readPackageMeta() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as PackageMeta;
    return {
      packageName: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "unknown",
      packageVersion:
        typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : "unknown",
    };
  } catch {
    return { packageName: "unknown", packageVersion: "unknown" };
  }
}

function readBuildMetaFile(): BuildInfo | null {
  try {
    const raw = readFileSync(path.join(process.cwd(), "build-meta.json"), "utf8");
    const parsed = JSON.parse(raw) as BuildMetaFile;
    const sha = typeof parsed.sha === "string" && parsed.sha.trim() ? parsed.sha.trim() : null;
    if (!sha) {
      return null;
    }
    const packageMeta = readPackageMeta();
    return {
      sha,
      shortSha:
        typeof parsed.shortSha === "string" && parsed.shortSha.trim()
          ? parsed.shortSha.trim()
          : getShortSha(sha),
      versionLabel:
        typeof parsed.versionLabel === "string" && parsed.versionLabel.trim()
          ? parsed.versionLabel.trim()
          : computeVersionLabel(
              typeof parsed.branch === "string" && parsed.branch.trim() ? parsed.branch.trim() : null,
              typeof parsed.shortSha === "string" && parsed.shortSha.trim()
                ? parsed.shortSha.trim()
                : getShortSha(sha),
              typeof parsed.dirty === "boolean" ? parsed.dirty : null
            ),
      builtAt: typeof parsed.builtAt === "string" && parsed.builtAt.trim() ? parsed.builtAt.trim() : null,
      source: typeof parsed.source === "string" && parsed.source.trim() ? parsed.source.trim() : "build-meta-file",
      branch: typeof parsed.branch === "string" && parsed.branch.trim() ? parsed.branch.trim() : null,
      dirty: typeof parsed.dirty === "boolean" ? parsed.dirty : null,
      ...packageMeta,
    };
  } catch {
    return null;
  }
}

function readEnvBuild(packageMeta: ReturnType<typeof readPackageMeta>): BuildInfo | null {
  const sha =
    process.env.DOC_BUILD_SHA?.trim() ||
    process.env.SOURCE_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    "";

  const builtAt = process.env.DOC_BUILD_TIMESTAMP?.trim() || null;
  const source = process.env.DOC_BUILD_SOURCE?.trim() || "runtime-env";
  const branch = process.env.DOC_BUILD_BRANCH?.trim() || null;
  const dirty =
    process.env.DOC_BUILD_DIRTY?.trim() === "true"
      ? true
      : process.env.DOC_BUILD_DIRTY?.trim() === "false"
        ? false
        : null;

  if (!sha && !builtAt && source === "runtime-env" && !branch && dirty === null) {
    return null;
  }

  const resolvedSha = sha || "unknown";
  const shortSha = getShortSha(resolvedSha);

  return {
    sha: resolvedSha,
    shortSha,
    versionLabel: computeVersionLabel(branch, shortSha, dirty),
    builtAt,
    source,
    branch,
    dirty,
    ...packageMeta,
  };
}

export function getBuildInfo(): BuildInfo {
  const packageMeta = readPackageMeta();
  const fileBuild = readBuildMetaFile();
  const envBuild = readEnvBuild(packageMeta);

  if (
    envBuild &&
    envBuild.sha !== "unknown" &&
    (envBuild.source !== "runtime-env" || envBuild.builtAt || envBuild.dirty !== null || envBuild.branch)
  ) {
    return envBuild;
  }

  if (fileBuild) {
    return fileBuild;
  }

  return (
    envBuild ?? {
      sha: "unknown",
      shortSha: "unknown",
      versionLabel: computeVersionLabel(null, "unknown", null),
      builtAt: null,
      source: "runtime-env",
      branch: null,
      dirty: null,
      ...packageMeta,
    }
  );
}
