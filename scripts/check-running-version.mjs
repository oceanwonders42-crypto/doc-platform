import {
  commitsMatch,
  fetchVersionInfo,
  printFail,
  printPass,
  printWarn,
  resolveGitState,
} from "./deploy-lib.mjs";

function printUsage() {
  console.log(
    "Usage: node scripts/check-running-version.mjs [--expect-sha <sha>] [--expect-short-sha <shortSha>] [--expect-version-label <label>] [--require-services <csv>] [--allow-dirty] <url-or-base-url> [more-urls]"
  );
}

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
  printUsage();
  process.exit(rawArgs.length === 0 ? 1 : 0);
}

let expectedCommit = null;
let expectedShortSha = null;
let expectedVersionLabel = null;
let requiredServices = [];
let allowDirty = false;
const targets = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--expect-sha") {
    expectedCommit = rawArgs[index + 1]?.trim() || null;
    index += 1;
    continue;
  }
  if (arg === "--expect-short-sha") {
    expectedShortSha = rawArgs[index + 1]?.trim() || null;
    index += 1;
    continue;
  }
  if (arg === "--expect-version-label") {
    expectedVersionLabel = rawArgs[index + 1]?.trim() || null;
    index += 1;
    continue;
  }
  if (arg === "--require-services") {
    requiredServices = (rawArgs[index + 1] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    index += 1;
    continue;
  }
  if (arg === "--allow-dirty") {
    allowDirty = true;
    continue;
  }
  targets.push(arg);
}

if (targets.length === 0) {
  printUsage();
  printFail("no targets were provided", "Pass the API and web base URLs to verify the live deployment.");
  process.exit(1);
}

const localGit = resolveGitState();
expectedCommit = expectedCommit ?? localGit.sha;
expectedShortSha = expectedShortSha ?? localGit.shortSha;
expectedVersionLabel = expectedVersionLabel ?? localGit.versionLabel;

console.log(
  `[version-check] local branch=${localGit.branch} sha=${localGit.sha} shortSha=${localGit.shortSha} dirty=${
    localGit.dirty ? "YES" : "NO"
  }`
);

const failures = [];
const results = [];

for (const target of targets) {
  try {
    const result = await fetchVersionInfo(target);
    results.push(result);
    console.log(
      `[version-check] service=${result.service} commit=${result.commitHash} shortSha=${
        result.shortCommitHash ?? "unknown"
      } versionLabel=${result.versionLabel} dirty=${
        result.buildDirty === null ? "unknown" : result.buildDirty ? "YES" : "NO"
      } url=${result.url}`
    );

    if (result.commitHash === "unknown") {
      failures.push(`${result.service} did not report commitHash`);
    } else if (!commitsMatch(expectedCommit, result.commitHash)) {
      failures.push(`${result.service} commitHash ${result.commitHash} does not match expected ${expectedCommit}`);
    }

    if (!result.shortCommitHash) {
      failures.push(`${result.service} did not report shortCommitHash`);
    } else if (expectedShortSha && result.shortCommitHash !== expectedShortSha) {
      failures.push(
        `${result.service} shortCommitHash ${result.shortCommitHash} does not match expected ${expectedShortSha}`
      );
    }

    if (!result.versionLabel) {
      failures.push(`${result.service} did not report versionLabel`);
    } else if (expectedVersionLabel && result.versionLabel !== expectedVersionLabel) {
      failures.push(
        `${result.service} versionLabel ${result.versionLabel} does not match expected ${expectedVersionLabel}`
      );
    }

    if (result.buildDirty === true) {
      if (allowDirty) {
        printWarn(`${result.service} is reporting dirty=true (bypass enabled)`);
      } else {
        failures.push(`${result.service} is reporting dirty=true`);
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

const distinctCommits = [...new Set(results.map((result) => result.commitHash).filter((value) => value && value !== "unknown"))];
const distinctShortShas = [...new Set(results.map((result) => result.shortCommitHash).filter(Boolean))];
const distinctVersionLabels = [...new Set(results.map((result) => result.versionLabel).filter(Boolean))];

if (distinctCommits.length > 1) {
  failures.push(`live API/web commitHash mismatch (${distinctCommits.join(", ")})`);
}
if (distinctShortShas.length > 1) {
  failures.push(`live API/web shortCommitHash mismatch (${distinctShortShas.join(", ")})`);
}
if (distinctVersionLabels.length > 1) {
  failures.push(`live API/web versionLabel mismatch (${distinctVersionLabels.join(", ")})`);
}

if (requiredServices.length > 0) {
  const reportedServices = new Set(results.map((result) => result.service));
  for (const service of requiredServices) {
    if (!reportedServices.has(service)) {
      failures.push(`required service ${service} was not returned by any /version endpoint`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    printFail(
      failure,
      "Rebuild and redeploy until API and web both report the same clean commit. If production is already wrong, use pnpm deploy:history to choose a rollback target."
    );
  }
  process.exit(1);
}

const commitLabel = distinctCommits[0] ?? expectedCommit;
const shortLabel = distinctShortShas[0] ?? expectedShortSha;
const versionLabel = distinctVersionLabels[0] ?? expectedVersionLabel;
printPass(
  `production is serving commit ${commitLabel} (${shortLabel}, ${versionLabel}) cleanly on both api and web`
);
