import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.dirname(scriptDir);

export const DEFAULT_CANONICAL_REMOTE = "https://github.com/oceanwonders42-crypto/doc-platform.git";
export const LOCKED_PRODUCTION_REF_PREFIX = "production-demand-bank-locked-";
export const DEFAULT_CANONICAL_BRANCH = "production-demand-bank-locked-20260423-1";
export const DEFAULT_LOCKED_COMMIT_SHA = "424bd54f5c437ebf17124063b8d0e41fd5a977e4";

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizePath(value) {
  return path.normalize(String(value ?? ""));
}

export function sanitizeFileToken(value, fallback = "unknown") {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

export function normalizeGitRemote(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let next = value.trim();
  if (next.startsWith("git@github.com:")) {
    next = `https://github.com/${next.slice("git@github.com:".length)}`;
  }
  next = next.replace(/\.git$/i, "");
  next = next.replace(/\/+$/g, "");
  return next;
}

export function isLockedProductionRef(value) {
  return typeof value === "string" && value.trim().startsWith(LOCKED_PRODUCTION_REF_PREFIX);
}

export function pathWithin(parentPath, candidatePath) {
  const parent = normalizePath(parentPath);
  const candidate = normalizePath(candidatePath);
  if (!parent || !candidate) return false;
  if (parent === candidate) return true;
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function buildReleaseName({ branch, shortSha, builtAt }) {
  const timestamp = String(builtAt ?? "")
    .replace(/[:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[^0-9TZ-]/g, "");
  return `${sanitizeFileToken(branch, "detached")}-${sanitizeFileToken(shortSha, "unknown")}-${sanitizeFileToken(
    timestamp,
    "release"
  )}`;
}

export function resolveProductionReleaseConfig(options = {}) {
  const repoRoot = normalizePath(options.repoRoot ?? defaultRepoRoot);
  const repoParent = path.dirname(repoRoot);
  const isLinux = process.platform === "linux";

  const stateRoot = normalizePath(
    readEnv("DOC_PROD_STATE_ROOT") ?? (isLinux ? "/root/doc-platform-production" : path.join(repoParent, "doc-platform-production"))
  );
  const releasesRoot = normalizePath(
    readEnv("DOC_PROD_RELEASES_ROOT") ?? (isLinux ? "/root/doc-platform-releases" : path.join(repoParent, "doc-platform-releases"))
  );
  const canonicalSourceRoot = normalizePath(
    readEnv("DOC_PROD_CANONICAL_SOURCE") ?? (isLinux ? "/root/doc-platform-canonical" : repoRoot)
  );
  const durableApiEnvPath = normalizePath(
    readEnv("DOC_PROD_API_ENV") ?? (isLinux ? "/root/doc-platform/apps/api/.env" : path.join(repoRoot, "apps", "api", ".env"))
  );
  const durableWebEnvPath = normalizePath(
    readEnv("DOC_PROD_WEB_ENV") ??
      (isLinux ? "/root/doc-platform/apps/web/.env.local" : path.join(repoRoot, "apps", "web", ".env.local"))
  );
  const legacyRuntimeRoots = String(
    readEnv("DOC_PROD_LEGACY_RUNTIME_ROOTS") ?? (isLinux ? "/root/doc-platform" : "")
  )
    .split(",")
    .map((value) => normalizePath(value.trim()))
    .filter(Boolean);

  return {
    repoRoot,
    isLinux,
    canonicalRemote: normalizeGitRemote(readEnv("DOC_PROD_CANONICAL_REMOTE") ?? DEFAULT_CANONICAL_REMOTE),
    canonicalBranch: readEnv("DOC_PROD_CANONICAL_BRANCH") ?? DEFAULT_CANONICAL_BRANCH,
    canonicalCommitSha: readEnv("DOC_PROD_CANONICAL_SHA") ?? DEFAULT_LOCKED_COMMIT_SHA,
    canonicalSourceRoot,
    releasesRoot,
    stateRoot,
    durableApiEnvPath,
    durableWebEnvPath,
    legacyRuntimeRoots,
    deployDir: path.join(stateRoot, "deploy"),
    deployHistoryFile: path.join(stateRoot, "deploy", "history.jsonl"),
    latestDeployFile: path.join(stateRoot, "deploy", "latest.json"),
    pm2LogRoot: path.join(stateRoot, "logs", "pm2"),
    smokeLogRoot: path.join(stateRoot, "logs", "smoke"),
  };
}
