import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const allowedPm2Apps = new Set(["doc-platform-api", "doc-platform-web", "doc-platform-worker"]);
const pm2CommandCandidates = process.platform === "win32" ? ["pm2.cmd", "pm2"] : ["pm2"];
const tesseractCommandCandidates = process.platform === "win32" ? ["tesseract.exe", "tesseract"] : ["tesseract"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimOutput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCommandString(command, args) {
  return [command, ...args]
    .map((part) => {
      if (typeof part !== "string") {
        return String(part);
      }

      return /\s/.test(part) ? `"${part}"` : part;
    })
    .join(" ");
}

function plainError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name ?? "Error",
    message: error.message ?? String(error),
  };
}

function runCommand(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const env = { ...process.env, ...(options.env ?? {}) };
  const timeoutMs = options.timeoutMs ?? 15_000;
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
  });

  return {
    command: buildCommandString(command, args),
    cwd,
    success: result.status === 0 && !result.error,
    evidence: {
      exitCode: result.status,
      signal: result.signal ?? null,
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr),
      error: plainError(result.error),
      timedOut: result.error?.code === "ETIMEDOUT",
    },
  };
}

function runFirstAvailableCommand(candidates, args, options = {}) {
  const attempts = [];

  for (const command of candidates) {
    const attempt = runCommand(command, args, options);
    attempts.push(attempt);

    const missingExecutable =
      attempt.evidence.error?.code === "ENOENT" ||
      /not recognized as an internal or external command/i.test(attempt.evidence.stderr);

    if (!missingExecutable) {
      return {
        ...attempt,
        attempts,
      };
    }
  }

  return {
    command: buildCommandString(candidates[0] ?? "unknown", args),
    cwd: options.cwd ?? repoRoot,
    success: false,
    evidence: {
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: {
        name: "CommandNotFound",
        message: `None of the command candidates were available: ${candidates.join(", ")}`,
      },
      timedOut: false,
    },
    attempts,
  };
}

function normalizePm2AppState(entry) {
  const env = entry?.pm2_env ?? {};

  return {
    name: entry?.name ?? "unknown",
    status: env.status ?? "unknown",
    restartCount:
      typeof env.restart_time === "number"
        ? env.restart_time
        : typeof entry?.restart_time === "number"
          ? entry.restart_time
          : null,
    unstableRestarts:
      typeof env.unstable_restarts === "number"
        ? env.unstable_restarts
        : typeof entry?.unstable_restarts === "number"
          ? entry.unstable_restarts
          : null,
    pm_cwd: env.pm_cwd ?? null,
    cwd: env.cwd ?? null,
    pid: typeof entry?.pid === "number" ? entry.pid : null,
    pmId: typeof entry?.pm_id === "number" ? entry.pm_id : null,
    uptimeMs: typeof env.pm_uptime === "number" ? env.pm_uptime : null,
    execMode: env.exec_mode ?? null,
    script: env.pm_exec_path ?? env.script ?? null,
    args: Array.isArray(env.args) ? env.args : [],
  };
}

function emptyPm2Summary(commandResult, extra = {}) {
  return {
    success: false,
    command: commandResult.command,
    evidence: commandResult.evidence,
    apps: {},
    ...extra,
  };
}

function assertAllowedPm2App(appName) {
  if (!allowedPm2Apps.has(appName)) {
    throw new Error(`Unsupported PM2 app: ${appName}`);
  }
}

async function waitForPm2State(appName, expectedStatuses, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const intervalMs = options.intervalMs ?? 1_500;
  const startedAt = Date.now();
  let lastState = null;

  while (Date.now() - startedAt <= timeoutMs) {
    lastState = await collectPm2State(options);
    const appState = lastState.apps?.[appName] ?? null;

    if (appState && expectedStatuses.includes(appState.status)) {
      return {
        success: true,
        app: appState,
        state: lastState,
        waitedMs: Date.now() - startedAt,
      };
    }

    await sleep(intervalMs);
  }

  return {
    success: false,
    app: lastState?.apps?.[appName] ?? null,
    state: lastState,
    waitedMs: Date.now() - startedAt,
  };
}

export async function collectPm2State(options = {}) {
  const commandResult = runFirstAvailableCommand(pm2CommandCandidates, ["jlist"], {
    cwd: options.cwd ?? repoRoot,
    env: options.env,
    timeoutMs: options.timeoutMs ?? 15_000,
  });

  if (!commandResult.success) {
    return emptyPm2Summary(commandResult, { attempts: commandResult.attempts ?? [] });
  }

  let parsed;
  try {
    parsed = JSON.parse(commandResult.evidence.stdout || "[]");
  } catch (error) {
    return emptyPm2Summary(commandResult, {
      evidence: {
        ...commandResult.evidence,
        parseError: plainError(error),
      },
      attempts: commandResult.attempts ?? [],
    });
  }

  const apps = {};
  for (const appName of allowedPm2Apps) {
    const entry = Array.isArray(parsed) ? parsed.find((item) => item?.name === appName) : null;
    apps[appName] = entry ? normalizePm2AppState(entry) : null;
  }

  return {
    success: true,
    command: commandResult.command,
    evidence: commandResult.evidence,
    attempts: commandResult.attempts ?? [],
    apps,
  };
}

export async function restartPm2App(appName, options = {}) {
  assertAllowedPm2App(appName);

  const args = ["restart", appName];
  if (options.updateEnv === true) {
    args.push("--update-env");
  }

  const commandResult = runFirstAvailableCommand(pm2CommandCandidates, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env,
    timeoutMs: options.commandTimeoutMs ?? 30_000,
  });

  if (!commandResult.success) {
    return {
      success: false,
      appName,
      action: "restart",
      command: commandResult.command,
      evidence: commandResult.evidence,
      attempts: commandResult.attempts ?? [],
      state: null,
    };
  }

  const settled = await waitForPm2State(appName, ["online"], options);
  return {
    success: settled.success,
    appName,
    action: "restart",
    command: commandResult.command,
    evidence: commandResult.evidence,
    attempts: commandResult.attempts ?? [],
    state: settled.state,
    app: settled.app,
    waitedMs: settled.waitedMs,
  };
}

export async function reloadPm2App(appName, options = {}) {
  assertAllowedPm2App(appName);

  const args = ["reload", appName];
  if (options.updateEnv !== false) {
    args.push("--update-env");
  }

  const commandResult = runFirstAvailableCommand(pm2CommandCandidates, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env,
    timeoutMs: options.commandTimeoutMs ?? 30_000,
  });

  if (!commandResult.success) {
    return {
      success: false,
      appName,
      action: "reload",
      command: commandResult.command,
      evidence: commandResult.evidence,
      attempts: commandResult.attempts ?? [],
      state: null,
    };
  }

  const settled = await waitForPm2State(appName, ["online"], options);
  return {
    success: settled.success,
    appName,
    action: "reload",
    command: commandResult.command,
    evidence: commandResult.evidence,
    attempts: commandResult.attempts ?? [],
    state: settled.state,
    app: settled.app,
    waitedMs: settled.waitedMs,
  };
}

export async function discoverTesseract(options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const env = options.env ?? {};
  const pathCheck = runFirstAvailableCommand(tesseractCommandCandidates, ["--version"], {
    cwd,
    env,
    timeoutMs,
  });

  if (pathCheck.success) {
    const langsCheck = runFirstAvailableCommand(tesseractCommandCandidates, ["--list-langs"], {
      cwd,
      env,
      timeoutMs,
    });
    return {
      success: true,
      source: "PATH",
      command: pathCheck.command,
      evidence: {
        version: pathCheck.evidence,
        languages: langsCheck.evidence,
      },
      resolvedPath: trimOutput(pathCheck.evidence.stdout).split(/\r?\n/)[0] || "tesseract",
      tesseractPathEnv: process.env.TESSERACT_PATH ?? null,
    };
  }

  const configuredPath = options.tesseractPath ?? process.env.TESSERACT_PATH ?? null;
  if (!configuredPath) {
    return {
      success: false,
      source: null,
      command: pathCheck.command,
      evidence: {
        pathAttempt: pathCheck.evidence,
      },
      resolvedPath: null,
      tesseractPathEnv: null,
    };
  }

  const versionCheck = runCommand(configuredPath, ["--version"], {
    cwd,
    env,
    timeoutMs,
  });
  const languagesCheck = runCommand(configuredPath, ["--list-langs"], {
    cwd,
    env,
    timeoutMs,
  });

  return {
    success: versionCheck.success,
    source: versionCheck.success ? "TESSERACT_PATH" : null,
    command: versionCheck.command,
    evidence: {
      pathAttempt: pathCheck.evidence,
      version: versionCheck.evidence,
      languages: languagesCheck.evidence,
    },
    resolvedPath: versionCheck.success ? configuredPath : null,
    tesseractPathEnv: configuredPath,
  };
}
