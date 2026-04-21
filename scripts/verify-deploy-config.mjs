import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { printFail, printPass, printWarn, readBuildMeta, repoRoot } from "./deploy-lib.mjs";

const require = createRequire(import.meta.url);

function readScript(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readPackageScripts(packagePath) {
  const raw = await readFile(packagePath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed?.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
}

async function readJsonFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePath(value) {
  return path.normalize(String(value));
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function findPm2App(ecosystem, name) {
  return Array.isArray(ecosystem?.apps) ? ecosystem.apps.find((app) => app?.name === name) ?? null : null;
}

function verifyPm2App({ failures, passes }, app, expected) {
  if (!app) {
    failures.push(`PM2 app ${expected.name} is missing from ecosystem.config.cjs`);
    return;
  }

  if (normalizePath(app.cwd) !== normalizePath(expected.cwd)) {
    failures.push(`PM2 app ${expected.name} cwd is ${app.cwd}; expected ${expected.cwd}`);
  } else {
    passes.push(`PM2 app ${expected.name} cwd points at ${expected.cwd}`);
  }

  if (normalizePath(app.script) !== normalizePath(expected.script)) {
    failures.push(`PM2 app ${expected.name} script is ${app.script}; expected ${expected.script}`);
  } else {
    passes.push(`PM2 app ${expected.name} script points at ${expected.script}`);
  }

  const actualArgs = Array.isArray(app.args) ? app.args : [];
  const expectedArgs = expected.args;
  if (JSON.stringify(actualArgs) !== JSON.stringify(expectedArgs)) {
    failures.push(
      `PM2 app ${expected.name} args are ${JSON.stringify(actualArgs)}; expected ${JSON.stringify(expectedArgs)}`
    );
  } else {
    passes.push(`PM2 app ${expected.name} args match the expected start path`);
  }
}

function verifyBuildScript({ failures, passes }, service, script) {
  if (!script?.includes("write-build-meta.mjs")) {
    failures.push(`apps/${service}/package.json build script no longer writes build-meta.json`);
    return;
  }

  const writesPendingState = script.includes("--state pending");
  const writesCompleteState = script.includes("--state complete");
  if (!writesPendingState || !writesCompleteState) {
    failures.push(
      `apps/${service}/package.json build script must mark build-meta.json as pending before build and complete after build`
    );
    return;
  }

  passes.push(`apps/${service} build script marks build-meta.json pending before build and complete after build`);
}

function verifyStartScript({ failures, passes }, service, script) {
  if (!script?.includes("start-service-with-build-info.mjs")) {
    failures.push(`apps/${service}/package.json start script no longer launches through start-service-with-build-info.mjs`);
    return;
  }

  passes.push(`apps/${service} start script launches through start-service-with-build-info.mjs`);
}

function verifyCompletedBuildMeta({ failures, warnings, passes }, service, buildMetaRaw) {
  if (!buildMetaRaw) {
    failures.push(`apps/${service}/build-meta.json could not be parsed after build`);
    return;
  }

  if (buildMetaRaw.buildState !== "complete") {
    failures.push(
      `apps/${service}/build-meta.json state is ${readScript(buildMetaRaw.buildState) ?? "unknown"}; expected complete`
    );
  } else {
    passes.push(`apps/${service}/build-meta.json reports buildState=complete`);
  }

  const missingFields = [];
  if (!readScript(buildMetaRaw.buildStartedAt)) missingFields.push("buildStartedAt");
  if (!readScript(buildMetaRaw.builtAt)) missingFields.push("builtAt");
  if (!readScript(buildMetaRaw.source)) missingFields.push("source");
  if (!readScript(buildMetaRaw.branch)) missingFields.push("branch");
  if (typeof buildMetaRaw.dirty !== "boolean") missingFields.push("dirty");

  if (missingFields.length > 0) {
    failures.push(`apps/${service}/build-meta.json is missing completed-build fields: ${missingFields.join(", ")}`);
  } else {
    passes.push(`apps/${service}/build-meta.json contains completed-build fields`);
  }

  if (buildMetaRaw.dirty === true) {
    warnings.push(`apps/${service}/build-meta.json reports a dirty build`);
  }
}

export async function verifyDeployConfig(options = {}) {
  const requireBuilt = options.requireBuilt === true;
  const expectedSha = readScript(options.expectedSha);
  const expectedVersionLabel = readScript(options.expectedVersionLabel);

  const failures = [];
  const warnings = [];
  const passes = [];

  const ecosystemPath = path.join(repoRoot, "ecosystem.config.cjs");
  const apiPackagePath = path.join(repoRoot, "apps", "api", "package.json");
  const webPackagePath = path.join(repoRoot, "apps", "web", "package.json");
  const startWrapperPath = path.join(repoRoot, "scripts", "start-service-with-build-info.mjs");

  const apiScripts = await readPackageScripts(apiPackagePath);
  const webScripts = await readPackageScripts(webPackagePath);
  const ecosystem = require(ecosystemPath);

  const apiBuildScript = readScript(apiScripts.build);
  const webBuildScript = readScript(webScripts.build);
  const apiStartScript = readScript(apiScripts.start);
  const webStartScript = readScript(webScripts.start);

  verifyBuildScript({ failures, passes }, "api", apiBuildScript);
  verifyBuildScript({ failures, passes }, "web", webBuildScript);
  verifyStartScript({ failures, passes }, "api", apiStartScript);
  verifyStartScript({ failures, passes }, "web", webStartScript);

  verifyPm2App(
    { failures, passes },
    findPm2App(ecosystem, "doc-platform-api"),
    {
      name: "doc-platform-api",
      cwd: path.join(repoRoot, "apps", "api"),
      script: startWrapperPath,
      args: ["api", "node", "dist/http/server.js"],
    }
  );
  verifyPm2App(
    { failures, passes },
    findPm2App(ecosystem, "doc-platform-worker"),
    {
      name: "doc-platform-worker",
      cwd: path.join(repoRoot, "apps", "api"),
      script: startWrapperPath,
      args: ["worker", "node", "dist/workers/worker.js"],
    }
  );
  verifyPm2App(
    { failures, passes },
    findPm2App(ecosystem, "doc-platform-web"),
    {
      name: "doc-platform-web",
      cwd: path.join(repoRoot, "apps", "web"),
      script: startWrapperPath,
      args: ["web", "node", "node_modules/next/dist/bin/next", "start"],
    }
  );

  if (!requireBuilt) {
    return { failures, warnings, passes };
  }

  const expectedFiles = [
    path.join(repoRoot, "apps", "api", "build-meta.json"),
    path.join(repoRoot, "apps", "api", "dist", "http", "server.js"),
    path.join(repoRoot, "apps", "api", "dist", "workers", "worker.js"),
    path.join(repoRoot, "apps", "web", "build-meta.json"),
    path.join(repoRoot, "apps", "web", ".next", "BUILD_ID"),
  ];

  for (const filePath of expectedFiles) {
    if (!(await fileExists(filePath))) {
      failures.push(`built artifact is missing: ${filePath}`);
    } else {
      passes.push(`built artifact exists: ${filePath}`);
    }
  }

  const apiBuildMeta = await readBuildMeta(path.join(repoRoot, "apps", "api"));
  const webBuildMeta = await readBuildMeta(path.join(repoRoot, "apps", "web"));
  const apiBuildMetaRaw = await readJsonFile(path.join(repoRoot, "apps", "api", "build-meta.json"));
  const webBuildMetaRaw = await readJsonFile(path.join(repoRoot, "apps", "web", "build-meta.json"));

  verifyCompletedBuildMeta({ failures, warnings, passes }, "api", apiBuildMetaRaw);
  verifyCompletedBuildMeta({ failures, warnings, passes }, "web", webBuildMetaRaw);

  if (apiBuildMeta && webBuildMeta) {
    if (apiBuildMeta.sha !== webBuildMeta.sha) {
      failures.push(`api/web build-meta SHA mismatch (${apiBuildMeta.sha} vs ${webBuildMeta.sha})`);
    } else {
      passes.push(`api/web build-meta SHA agree on ${apiBuildMeta.sha}`);
    }

    if (apiBuildMeta.versionLabel !== webBuildMeta.versionLabel) {
      failures.push(
        `api/web build-meta versionLabel mismatch (${apiBuildMeta.versionLabel} vs ${webBuildMeta.versionLabel})`
      );
    } else {
      passes.push(`api/web build-meta versionLabel agree on ${apiBuildMeta.versionLabel}`);
    }
  }

  for (const [service, buildMeta] of [
    ["api", apiBuildMeta],
    ["web", webBuildMeta],
  ]) {
    if (!buildMeta) continue;

    if (expectedSha && buildMeta.sha !== expectedSha) {
      failures.push(`${service} build-meta SHA ${buildMeta.sha} does not match expected ${expectedSha}`);
    } else if (expectedSha) {
      passes.push(`${service} build-meta SHA matches expected commit ${expectedSha}`);
    }

    if (expectedVersionLabel && buildMeta.versionLabel !== expectedVersionLabel) {
      failures.push(
        `${service} build-meta versionLabel ${buildMeta.versionLabel} does not match expected ${expectedVersionLabel}`
      );
    } else if (expectedVersionLabel) {
      passes.push(`${service} build-meta versionLabel matches expected ${expectedVersionLabel}`);
    }
  }

  return { failures, warnings, passes };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const requireBuilt = rawArgs.includes("--require-built");

  let expectedSha = null;
  let expectedVersionLabel = null;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--expect-sha") {
      expectedSha = rawArgs[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--expect-version-label") {
      expectedVersionLabel = rawArgs[index + 1] ?? null;
      index += 1;
    }
  }

  const result = await verifyDeployConfig({ requireBuilt, expectedSha, expectedVersionLabel });

  for (const pass of result.passes) {
    printPass(pass);
  }
  for (const warning of result.warnings) {
    printWarn(warning);
  }
  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      printFail(
        failure,
        requireBuilt
          ? "Rebuild the apps or fix ecosystem.config.cjs before reloading PM2."
          : "Fix the deployment wiring before attempting a release."
      );
    }
    process.exit(1);
  }

  printPass(requireBuilt ? "deploy config and built artifacts are consistent" : "deploy config is wired correctly");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    printFail(
      error instanceof Error ? error.message : String(error),
      "Fix the deployment verification error before shipping."
    );
    process.exit(1);
  });
}
