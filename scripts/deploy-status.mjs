import {
  commitsMatch,
  fetchVersionInfo,
  printFail,
  printPass,
  resolveGitState,
} from "./deploy-lib.mjs";

const localGit = resolveGitState();
const targets = [
  { service: "api", url: "http://127.0.0.1:4000" },
  { service: "web", url: "http://127.0.0.1:3000" },
];

const failures = [];
const liveResults = [];

console.log(`[deploy-status] local branch=${localGit.branch}`);
console.log(`[deploy-status] local sha=${localGit.sha}`);
console.log(`[deploy-status] local shortSha=${localGit.shortSha}`);
console.log(`[deploy-status] local dirty=${localGit.dirty ? "YES" : "NO"}`);
console.log(`[deploy-status] local versionLabel=${localGit.versionLabel}`);

if (localGit.sha === "unknown") {
  failures.push("local git SHA could not be resolved");
}
if (localGit.dirty) {
  failures.push("local working tree is dirty");
}

for (const target of targets) {
  try {
    const result = await fetchVersionInfo(target.url);
    liveResults.push(result);
    console.log(
      `[deploy-status] ${target.service} live sha=${result.commitHash} shortSha=${
        result.shortCommitHash ?? "unknown"
      } dirty=${result.buildDirty === true ? "YES" : result.buildDirty === false ? "NO" : "unknown"} versionLabel=${
        result.versionLabel
      }`
    );
  } catch (error) {
    failures.push(`${target.service} is unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const api = liveResults.find((entry) => entry.service === "api");
const web = liveResults.find((entry) => entry.service === "web");

if (!api) failures.push("API live version is unavailable");
if (!web) failures.push("web live version is unavailable");

if (api && web) {
  if (api.commitHash !== web.commitHash) {
    failures.push(`live API/web commitHash mismatch (${api.commitHash} vs ${web.commitHash})`);
  }
  if ((api.shortCommitHash ?? "unknown") !== (web.shortCommitHash ?? "unknown")) {
    failures.push(
      `live API/web shortCommitHash mismatch (${api.shortCommitHash ?? "unknown"} vs ${web.shortCommitHash ?? "unknown"})`
    );
  }
  if (api.versionLabel !== web.versionLabel) {
    failures.push(`live API/web versionLabel mismatch (${api.versionLabel} vs ${web.versionLabel})`);
  }
}

for (const result of liveResults) {
  if (!commitsMatch(localGit.sha, result.commitHash)) {
    failures.push(`${result.service} live commit ${result.commitHash} does not match local ${localGit.sha}`);
  }
}

const liveMatchesLocal = failures.length === 0;
console.log(`[deploy-status] liveMatchesLocal=${liveMatchesLocal ? "YES" : "NO"}`);

if (failures.length > 0) {
  for (const failure of failures) {
    printFail(failure, "Redeploy or roll back until local, API, and web all report the same clean version.");
  }
  process.exit(1);
}

printPass(`local and live versions match (${localGit.sha}, ${localGit.versionLabel})`);
