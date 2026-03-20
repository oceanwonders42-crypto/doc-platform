import "server-only";

import type { Prisma, Project } from "@prisma/client";
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import type { RuntimeDetailSnapshot, RuntimeStatus } from "@/lib/runtime-checks";
import { reconcileRuntimeLinkedTasks } from "@/lib/task-ops";

const execFileAsync = promisify(execFile);
const sshTargetPattern = /^[a-zA-Z0-9._-]+$/;
const knownBuildFailurePattern = /Could not find a production build in the ['"]?\.next['"]? directory/i;

type ProjectRuntimeConfig = Pick<
  Project,
  | "id"
  | "name"
  | "slug"
  | "deployType"
  | "sshHost"
  | "sshPort"
  | "sshUser"
  | "publicUrl"
  | "internalApiHealthUrl"
  | "internalApiHealthzUrl"
  | "processManager"
  | "apiServiceName"
  | "apiServiceId"
  | "webServiceName"
  | "webServiceId"
>;

type ProbeMode = "live" | "mock";

type ProbeStatus = "healthy" | "degraded" | "failed" | "unhealthy" | "unknown";

type HttpProbe = {
  label: string;
  url: string | null;
  status: ProbeStatus;
  statusCode: number | null;
  summary: string;
  error: string | null;
};

type CommandKey = "pm2_status" | "api_describe" | "web_describe" | "web_logs" | "api_logs";

type SshProbe = {
  command: CommandKey;
  ok: boolean;
  stdout: string;
  stderr: string;
  summary: string;
  unavailable: boolean;
};

type LiveProbeResult = {
  ok: boolean;
  projectId: string;
  projectSlug: string;
  mode: ProbeMode;
  overallStatus: RuntimeStatus;
  runtimeReason: string | null;
  checkedAt: Date;
  apiHealthy: boolean | null;
  webHealthy: boolean | null;
  publicHealthy: boolean | null;
  runtimeDetails: RuntimeDetailSnapshot;
  probeFailures: string[];
};

function getProbeMode(): ProbeMode {
  return process.env.RUNTIME_PROBE_MODE === "mock" ? "mock" : "live";
}

function getHttpTimeoutMs() {
  const parsed = Number.parseInt(process.env.RUNTIME_HTTP_TIMEOUT_MS ?? "4000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
}

function getSshTimeoutMs() {
  const parsed = Number.parseInt(process.env.RUNTIME_SSH_TIMEOUT_MS ?? "6000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6000;
}

async function fetchWithTimeout(label: string, url: string | null): Promise<HttpProbe> {
  if (!url) {
    return {
      label,
      url,
      status: "unknown",
      statusCode: null,
      summary: `${label} is not configured.`,
      error: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getHttpTimeoutMs());

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });

    const status =
      response.status >= 200 && response.status < 400
        ? "healthy"
        : response.status >= 500
          ? "failed"
          : "degraded";

    return {
      label,
      url,
      status,
      statusCode: response.status,
      summary: `${label} returned ${response.status}.`,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Probe failed.";

    return {
      label,
      url,
      status: "unknown",
      statusCode: null,
      summary: `${label} probe unavailable.`,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isLoopbackHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

async function getFreeLocalPort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate a local port for SSH port forwarding."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });

    server.on("error", reject);
  });
}

async function waitForLocalPort(port: number, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve(true);
      });

      socket.on("error", () => resolve(false));
    });

    if (connected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for the SSH local port forward.");
}

async function withSshPortForward<T>(
  project: Pick<ProjectRuntimeConfig, "sshHost" | "sshPort" | "sshUser">,
  remoteHost: string,
  remotePort: number,
  callback: (forwardedBaseUrl: string) => Promise<T>,
) {
  if (!project.sshHost || !project.sshUser || !project.sshPort) {
    throw new Error("SSH tunneling is unavailable because SSH host/user/port is not fully configured.");
  }

  const identityFile = process.env.RUNTIME_SSH_IDENTITY_FILE?.trim();
  const knownHostsFile = process.env.RUNTIME_SSH_KNOWN_HOSTS_FILE?.trim();
  const localPort = await getFreeLocalPort();
  const args = [
    "-p",
    String(project.sshPort),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.max(1, Math.ceil(getSshTimeoutMs() / 1000))}`,
    "-o",
    "ExitOnForwardFailure=yes",
    "-L",
    `${localPort}:${remoteHost}:${remotePort}`,
  ];

  if (identityFile) {
    args.push("-i", identityFile, "-o", "IdentitiesOnly=yes");
  }

  if (knownHostsFile) {
    args.push("-o", `UserKnownHostsFile=${knownHostsFile}`);
  }

  args.push(`${project.sshUser}@${project.sshHost}`, "-N");

  const child = spawn("ssh", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await Promise.race([
      waitForLocalPort(localPort, getSshTimeoutMs()),
      new Promise<never>((_, reject) => {
        child.once("exit", (code) => {
          reject(new Error(stderr.trim() || `SSH port forward exited early with code ${code ?? "unknown"}.`));
        });
      }),
    ]);

    return await callback(`http://127.0.0.1:${localPort}`);
  } finally {
    child.kill("SIGTERM");
  }
}

async function probeInternalEndpoints(project: ProjectRuntimeConfig) {
  const healthUrl = project.internalApiHealthUrl;
  const healthzUrl = project.internalApiHealthzUrl;

  if (!healthUrl && !healthzUrl) {
    return {
      api: await fetchWithTimeout("API /health", null),
      healthz: await fetchWithTimeout("API /healthz", null),
    };
  }

  const urls = [healthUrl, healthzUrl]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value));
  const shouldTunnel =
    urls.length > 0 &&
    urls.every((value) => isLoopbackHostname(value.hostname)) &&
    urls.every((value) => value.port === urls[0]?.port && value.hostname === urls[0]?.hostname);

  if (!shouldTunnel) {
    return {
      api: await fetchWithTimeout("API /health", healthUrl),
      healthz: await fetchWithTimeout("API /healthz", healthzUrl),
    };
  }

  try {
    return await withSshPortForward(
      project,
      urls[0]?.hostname ?? "127.0.0.1",
      Number.parseInt(urls[0]?.port || "80", 10),
      async (forwardedBaseUrl) => {
        const apiPath = healthUrl ? new URL(healthUrl).pathname : null;
        const healthzPath = healthzUrl ? new URL(healthzUrl).pathname : null;

        return {
          api: await fetchWithTimeout("API /health", apiPath ? `${forwardedBaseUrl}${apiPath}` : null),
          healthz: await fetchWithTimeout("API /healthz", healthzPath ? `${forwardedBaseUrl}${healthzPath}` : null),
        };
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "SSH tunnel unavailable.";

    return {
      api: {
        label: "API /health",
        url: healthUrl,
        status: "unknown" as const,
        statusCode: null,
        summary: `API /health probe unavailable: ${message}`,
        error: message,
      },
      healthz: {
        label: "API /healthz",
        url: healthzUrl,
        status: "unknown" as const,
        statusCode: null,
        summary: `API /healthz probe unavailable: ${message}`,
        error: message,
      },
    };
  }
}

function sanitizeServiceTarget(name: string | null, id: number | null) {
  if (name && sshTargetPattern.test(name)) {
    return name;
  }

  if (typeof id === "number" && Number.isInteger(id) && id >= 0) {
    return String(id);
  }

  return null;
}

function quoteRemoteArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildAllowedCommand(command: CommandKey, project: ProjectRuntimeConfig) {
  const apiTarget = sanitizeServiceTarget(project.apiServiceName, project.apiServiceId);
  const webTarget = sanitizeServiceTarget(project.webServiceName, project.webServiceId);

  switch (command) {
    case "pm2_status":
      return ["pm2", "status"];
    case "api_describe":
      return apiTarget ? ["pm2", "describe", apiTarget] : null;
    case "web_describe":
      return webTarget ? ["pm2", "describe", webTarget] : null;
    case "web_logs":
      return webTarget ? ["pm2", "logs", webTarget, "--lines", "50", "--nostream"] : null;
    case "api_logs":
      return apiTarget ? ["pm2", "logs", apiTarget, "--lines", "50", "--nostream"] : null;
  }
}

async function runSshProbe(project: ProjectRuntimeConfig, command: CommandKey): Promise<SshProbe> {
  if (!project.sshHost || !project.sshUser || !project.sshPort) {
    return {
      command,
      ok: false,
      stdout: "",
      stderr: "",
      summary: "SSH probe unavailable because SSH host/user/port is not fully configured.",
      unavailable: true,
    };
  }

  if (project.processManager !== "pm2") {
    return {
      command,
      ok: false,
      stdout: "",
      stderr: "",
      summary: "SSH probe unavailable because the process manager is not PM2.",
      unavailable: true,
    };
  }

  const allowedCommand = buildAllowedCommand(command, project);

  if (!allowedCommand) {
    return {
      command,
      ok: false,
      stdout: "",
      stderr: "",
      summary: `SSH probe ${command} is unavailable because the PM2 target is not configured.`,
      unavailable: true,
    };
  }

  const identityFile = process.env.RUNTIME_SSH_IDENTITY_FILE?.trim();
  const knownHostsFile = process.env.RUNTIME_SSH_KNOWN_HOSTS_FILE?.trim();
  const args = [
    "-p",
    String(project.sshPort),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.max(1, Math.ceil(getSshTimeoutMs() / 1000))}`,
  ];

  if (identityFile) {
    args.push("-i", identityFile, "-o", "IdentitiesOnly=yes");
  }

  if (knownHostsFile) {
    args.push("-o", `UserKnownHostsFile=${knownHostsFile}`);
  }

  const remoteCommand = allowedCommand.map(quoteRemoteArg).join(" ");
  args.push(`${project.sshUser}@${project.sshHost}`, remoteCommand);

  try {
    const result = await execFileAsync("ssh", args, {
      timeout: getSshTimeoutMs(),
      maxBuffer: 1024 * 1024,
    });

    return {
      command,
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      summary: `${command} completed.`,
      unavailable: false,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "SSH probe failed.";

    return {
      command,
      ok: false,
      stdout: "",
      stderr: message,
      summary: `SSH probe ${command} failed.`,
      unavailable: true,
    };
  }
}

function parsePm2Status(stdout: string) {
  const normalized = stdout.toLowerCase();

  if (normalized.includes("online")) {
    return "online";
  }

  if (normalized.includes("errored") || normalized.includes("stopped")) {
    return "unhealthy";
  }

  return null;
}

function buildMockProbeResult(project: ProjectRuntimeConfig): LiveProbeResult {
  const checkedAt = new Date();

  return {
    ok: true,
    projectId: project.id,
    projectSlug: project.slug,
    mode: "mock",
    overallStatus: "degraded",
    runtimeReason: "Missing Next production build in apps/web/.next",
    checkedAt,
    apiHealthy: true,
    webHealthy: false,
    publicHealthy: false,
    runtimeDetails: {
      cause: "PM2 web logs show the Next production server cannot find the '.next' build output in apps/web/.next.",
      api: {
        label: "API health",
        url: project.internalApiHealthUrl,
        status: "healthy",
        statusCode: 200,
        summary: "API /health returned 200 during the runtime refresh.",
      },
      healthz: {
        label: "API healthz",
        url: project.internalApiHealthzUrl,
        status: "healthy",
        statusCode: 200,
        summary: "API /healthz returned 200 during the runtime refresh.",
      },
      public: {
        label: "Public entrypoint",
        url: project.publicUrl,
        status: "degraded",
        statusCode: 502,
        summary: "Public URL returned 502 Bad Gateway during the runtime refresh.",
      },
      web: {
        name: project.webServiceName ?? "web",
        id: project.webServiceId ?? null,
        manager: project.processManager,
        status: "unhealthy",
        summary: "PM2 web logs indicate the Next.js production build is missing.",
        logHint:
          "Could not find a production build in the '.next' directory. Try building your app with 'next build' before starting the production server.",
      },
      pm2Services: [
        {
          name: project.apiServiceName ?? "api",
          id: project.apiServiceId ?? null,
          manager: project.processManager,
          status: "healthy",
          summary: "PM2 api process responded as expected in the mock runtime refresh.",
        },
        {
          name: project.webServiceName ?? "web",
          id: project.webServiceId ?? null,
          manager: project.processManager,
          status: "unhealthy",
          summary: "PM2 web process is unhealthy in the mock runtime refresh.",
          logHint:
            "Could not find a production build in the '.next' directory. Try building your app with 'next build' before starting the production server.",
        },
      ],
      recommendedAction: "Run the web build on the server, restart the PM2 web service, and refresh runtime again.",
    },
    probeFailures: [],
  };
}

function classifyOverallStatus(input: {
  apiHealthy: boolean | null;
  publicHealthy: boolean | null;
  webHealthy: boolean | null;
  probeFailures: string[];
}): RuntimeStatus {
  if (input.apiHealthy === true && input.publicHealthy === true && input.webHealthy === true) {
    return "healthy";
  }

  if (input.apiHealthy === true && (input.publicHealthy === false || input.webHealthy === false)) {
    return "degraded";
  }

  if (
    (input.apiHealthy === false && input.publicHealthy === false) ||
    (input.apiHealthy !== true && input.publicHealthy !== true && input.probeFailures.length > 0)
  ) {
    return "failed";
  }

  return "unknown";
}

function toBooleanFromHttp(probe: HttpProbe) {
  if (probe.status === "healthy") {
    return true;
  }

  if (probe.status === "failed" || probe.status === "degraded") {
    return false;
  }

  return null;
}

export async function probeProjectRuntime(project: ProjectRuntimeConfig): Promise<LiveProbeResult> {
  if (project.deployType !== "droplet") {
    return {
      ok: false,
      projectId: project.id,
      projectSlug: project.slug,
      mode: getProbeMode(),
      overallStatus: "unknown",
      runtimeReason: "Runtime refresh is only implemented for droplet-backed projects in this pass.",
      checkedAt: new Date(),
      apiHealthy: null,
      webHealthy: null,
      publicHealthy: null,
      runtimeDetails: {
        recommendedAction: "Use stored metadata only for non-droplet projects until additional probe providers are added.",
      },
      probeFailures: ["unsupported deploy type"],
    };
  }

  if (getProbeMode() === "mock") {
    return buildMockProbeResult(project);
  }

  const [{ api, healthz }, publicProbe, pm2Status, apiDescribe, webDescribe, webLogs] = await Promise.all([
    probeInternalEndpoints(project),
    fetchWithTimeout("Public URL", project.publicUrl),
    runSshProbe(project, "pm2_status"),
    runSshProbe(project, "api_describe"),
    runSshProbe(project, "web_describe"),
    runSshProbe(project, "web_logs"),
  ]);

  const apiHealthyCandidates = [toBooleanFromHttp(api), toBooleanFromHttp(healthz)].filter(
    (value): value is boolean => typeof value === "boolean",
  );
  const apiHealthy =
    apiHealthyCandidates.length === 0 ? null : apiHealthyCandidates.some(Boolean);
  const publicHealthy = toBooleanFromHttp(publicProbe);

  const webDescribeStatus = parsePm2Status(webDescribe.stdout);
  const knownBuildFailure = knownBuildFailurePattern.test(webLogs.stdout) || knownBuildFailurePattern.test(webLogs.stderr);
  const webHealthy =
    knownBuildFailure
      ? false
      : webDescribeStatus === "online"
        ? publicHealthy === true
        : webDescribeStatus === "unhealthy"
          ? false
          : publicHealthy === false && apiHealthy === true
            ? false
            : null;

  const probeFailures = [
    api.error ? `API /health: ${api.error}` : null,
    healthz.error ? `API /healthz: ${healthz.error}` : null,
    publicProbe.error ? `Public URL: ${publicProbe.error}` : null,
    !pm2Status.ok ? `pm2 status: ${pm2Status.stderr || pm2Status.summary}` : null,
    !apiDescribe.ok ? `pm2 describe api: ${apiDescribe.stderr || apiDescribe.summary}` : null,
    !webDescribe.ok ? `pm2 describe web: ${webDescribe.stderr || webDescribe.summary}` : null,
    !webLogs.ok ? `pm2 logs web: ${webLogs.stderr || webLogs.summary}` : null,
  ].filter((value): value is string => Boolean(value));

  const runtimeReason = knownBuildFailure
    ? "Missing Next production build in apps/web/.next"
    : apiHealthy === true && publicHealthy === false
      ? "Public URL is degraded while the internal API remains healthy"
      : apiHealthy === false && publicHealthy === false
        ? "API and public probes are both failing"
        : probeFailures.length > 0
          ? "One or more live runtime probes were unavailable"
          : null;

  const overallStatus = classifyOverallStatus({
    apiHealthy,
    publicHealthy,
    webHealthy,
    probeFailures,
  });

  return {
    ok: overallStatus !== "failed" || apiHealthy === true || publicHealthy === true,
    projectId: project.id,
    projectSlug: project.slug,
    mode: "live",
    overallStatus,
    runtimeReason,
    checkedAt: new Date(),
    apiHealthy,
    webHealthy,
    publicHealthy,
    runtimeDetails: {
      cause: knownBuildFailure
        ? "PM2 web logs show the Next production server cannot find the '.next' build output in apps/web/.next."
        : probeFailures[0] ?? null,
      api: {
        label: "API health",
        url: api.url,
        status: api.status === "failed" ? "unhealthy" : api.status,
        statusCode: api.statusCode,
        summary: api.statusCode
          ? `API /health returned ${api.statusCode}.`
          : api.error
            ? `API /health probe unavailable: ${api.error}`
            : api.summary,
      },
      healthz: {
        label: "API healthz",
        url: healthz.url,
        status: healthz.status === "failed" ? "unhealthy" : healthz.status,
        statusCode: healthz.statusCode,
        summary: healthz.statusCode
          ? `API /healthz returned ${healthz.statusCode}.`
          : healthz.error
            ? `API /healthz probe unavailable: ${healthz.error}`
            : healthz.summary,
      },
      public: {
        label: "Public entrypoint",
        url: publicProbe.url,
        status: publicProbe.status === "failed" ? "degraded" : publicProbe.status,
        statusCode: publicProbe.statusCode,
        summary: publicProbe.statusCode
          ? `Public URL returned ${publicProbe.statusCode}.`
          : publicProbe.error
            ? `Public URL probe unavailable: ${publicProbe.error}`
            : publicProbe.summary,
      },
      web: {
        name: project.webServiceName ?? "web",
        id: project.webServiceId ?? null,
        manager: project.processManager,
        status: knownBuildFailure ? "unhealthy" : webHealthy === true ? "healthy" : webHealthy === false ? "unhealthy" : "unknown",
        summary: knownBuildFailure
          ? "PM2 web logs indicate the Next.js production build is missing."
          : webDescribe.ok
            ? `PM2 describe web completed${webDescribeStatus ? ` with status ${webDescribeStatus}` : ""}.`
            : webDescribe.summary,
        logHint: knownBuildFailure
          ? "Could not find a production build in the '.next' directory. Try building your app with 'next build' before starting the production server."
          : webLogs.ok
            ? webLogs.stdout.split("\n").slice(0, 2).join(" ").trim() || null
            : webLogs.stderr || null,
      },
      pm2Services: [
        {
          name: project.apiServiceName ?? "api",
          id: project.apiServiceId ?? null,
          manager: project.processManager,
          status: apiHealthy === true ? "healthy" : apiHealthy === false ? "unhealthy" : "unknown",
          summary: apiDescribe.ok
            ? apiDescribe.stdout.split("\n").find((line) => line.toLowerCase().includes("status"))?.trim() ??
              "PM2 describe api completed."
            : apiDescribe.summary,
        },
        {
          name: project.webServiceName ?? "web",
          id: project.webServiceId ?? null,
          manager: project.processManager,
          status: knownBuildFailure ? "unhealthy" : webHealthy === true ? "healthy" : webHealthy === false ? "unhealthy" : "unknown",
          summary: webDescribe.ok
            ? webDescribe.stdout.split("\n").find((line) => line.toLowerCase().includes("status"))?.trim() ??
              "PM2 describe web completed."
            : webDescribe.summary,
          logHint: knownBuildFailure
            ? "Could not find a production build in the '.next' directory. Try building your app with 'next build' before starting the production server."
            : null,
        },
      ],
      pm2Summary: pm2Status.ok ? pm2Status.stdout.split("\n").slice(0, 8).join("\n") : pm2Status.summary,
      recommendedAction: knownBuildFailure
        ? "Run the web build on the server, then restart the PM2 web process and refresh runtime again."
        : probeFailures.length > 0
          ? "Fix probe connectivity or SSH access, then refresh runtime again."
          : null,
    } as RuntimeDetailSnapshot & { pm2Summary?: string | null },
    probeFailures,
  };
}

async function getProjectForRuntimeRefresh(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      slug: true,
      deployType: true,
      sshHost: true,
      sshPort: true,
      sshUser: true,
      publicUrl: true,
      internalApiHealthUrl: true,
      internalApiHealthzUrl: true,
      processManager: true,
      apiServiceName: true,
      apiServiceId: true,
      webServiceName: true,
      webServiceId: true,
    },
  });
}

export async function refreshProjectRuntime(projectId: string) {
  const project = await getProjectForRuntimeRefresh(projectId);

  if (!project) {
    return {
      ok: false,
      status: "unknown" as RuntimeStatus,
      message: "Project not found.",
      projectSlug: null,
    };
  }

  const result = await probeProjectRuntime(project);

  const updateData: Prisma.ProjectUpdateInput = {
    apiHealthy: result.apiHealthy,
    webHealthy: result.webHealthy,
    publicHealthy: result.publicHealthy,
    runtimeStatus: result.overallStatus,
    lastRuntimeCheckAt: result.checkedAt,
    runtimeReason: result.runtimeReason,
    runtimeDetails: result.runtimeDetails as Prisma.InputJsonValue,
  };

  await prisma.project.update({
    where: { id: project.id },
    data: updateData,
  });

  await logActivity({
    projectId: project.id,
    type: "runtime.status.updated",
    message: `Runtime status updated for ${project.name}: ${result.overallStatus}.`,
    metadata: {
      mode: result.mode,
      apiHealthy: result.apiHealthy,
      webHealthy: result.webHealthy,
      publicHealthy: result.publicHealthy,
      checkedAt: result.checkedAt.toISOString(),
    },
  });

  if (result.runtimeReason) {
    await logActivity({
      projectId: project.id,
      type: "runtime.issue.detected",
      message: result.runtimeReason,
      metadata: {
        mode: result.mode,
      },
    });
  }

  if (result.probeFailures.length > 0) {
    await logActivity({
      projectId: project.id,
      type: "runtime.check.failed",
      message: `Runtime refresh hit ${result.probeFailures.length} unavailable probe(s).`,
      metadata: {
        failures: result.probeFailures,
        mode: result.mode,
      },
    });
  }

  await reconcileRuntimeLinkedTasks({
    projectId: project.id,
    overallStatus: result.overallStatus,
    checkedAt: result.checkedAt,
    reason: result.runtimeReason,
  });

  return {
    ok: result.ok,
    status: result.overallStatus,
    message: result.runtimeReason ?? `Runtime refresh completed with status ${result.overallStatus}.`,
    checkedAt: result.checkedAt.toISOString(),
    projectSlug: project.slug,
    mode: result.mode,
    probeFailures: result.probeFailures,
  };
}
