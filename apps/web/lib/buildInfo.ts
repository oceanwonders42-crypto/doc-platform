import { readFileSync } from "node:fs";
import path from "node:path";

export type BuildInfo = {
  sha: string;
  shortSha: string;
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

export function getBuildInfo(): BuildInfo {
  const fileBuild = readBuildMetaFile();
  if (fileBuild) {
    return fileBuild;
  }

  const packageMeta = readPackageMeta();
  return {
    sha:
      process.env.DOC_BUILD_SHA?.trim() ||
      process.env.SOURCE_VERSION?.trim() ||
      process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      "unknown",
    shortSha: getShortSha(
      process.env.DOC_BUILD_SHA?.trim() ||
        process.env.SOURCE_VERSION?.trim() ||
        process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
        "unknown"
    ),
    builtAt: process.env.DOC_BUILD_TIMESTAMP?.trim() || null,
    source: process.env.DOC_BUILD_SOURCE?.trim() || "runtime-env",
    branch: process.env.DOC_BUILD_BRANCH?.trim() || null,
    dirty:
      process.env.DOC_BUILD_DIRTY?.trim() === "true"
        ? true
        : process.env.DOC_BUILD_DIRTY?.trim() === "false"
          ? false
          : null,
    ...packageMeta,
  };
}
