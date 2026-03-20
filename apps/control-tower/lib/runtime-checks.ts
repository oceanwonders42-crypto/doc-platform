import type { Prisma, Project } from "@prisma/client";

export type RuntimeStatus = "healthy" | "degraded" | "failed" | "unhealthy" | "unknown";
export type RuntimeActionId =
  | "check_pm2_status"
  | "check_api_health"
  | "check_public_url"
  | "view_web_logs"
  | "restart_web"
  | "build_web"
  | "full_deploy";

export type RuntimeAction = {
  id: RuntimeActionId;
  label: string;
  description: string;
  enabled: boolean;
};

export type RuntimeEndpointDetail = {
  label: string;
  url?: string | null;
  status: RuntimeStatus;
  statusCode?: number | null;
  summary: string;
};

export type RuntimeServiceDetail = {
  name: string;
  id?: number | null;
  manager?: string | null;
  status: RuntimeStatus;
  summary: string;
  logHint?: string | null;
};

export type RuntimeDetailSnapshot = {
  cause?: string | null;
  public?: RuntimeEndpointDetail | null;
  api?: RuntimeEndpointDetail | null;
  healthz?: RuntimeEndpointDetail | null;
  web?: RuntimeServiceDetail | null;
  pm2Services?: RuntimeServiceDetail[];
  pm2Summary?: string | null;
  recommendedAction?: string | null;
};

export type RuntimeSnapshot = {
  apiHealthy: boolean | null;
  webHealthy: boolean | null;
  publicHealthy: boolean | null;
  overallStatus: RuntimeStatus;
  checkedAt: Date | null;
  reason: string | null;
  details: RuntimeDetailSnapshot | null;
  actions: RuntimeAction[];
  source: "stored_snapshot" | "unconfigured";
};

type RuntimeProject = {
  deployType: Project["deployType"];
  apiHealthy: boolean | null;
  webHealthy: boolean | null;
  publicHealthy: boolean | null;
  runtimeStatus: string | null;
  lastRuntimeCheckAt: Date | null;
  runtimeReason: string | null;
  runtimeDetails: Prisma.JsonValue | null;
};

const DROPLET_ACTIONS: RuntimeAction[] = [
  {
    id: "check_pm2_status",
    label: "Check PM2 status",
    description: "Planned safe read-only PM2 process inspection over SSH.",
    enabled: false,
  },
  {
    id: "check_api_health",
    label: "Check API health",
    description: "Planned structured health probe against the configured internal API endpoints.",
    enabled: false,
  },
  {
    id: "check_public_url",
    label: "Check public URL",
    description: "Planned structured HTTP probe for the public entrypoint only.",
    enabled: false,
  },
  {
    id: "view_web_logs",
    label: "View web logs",
    description: "Planned read-only PM2 web log snapshot.",
    enabled: false,
  },
  {
    id: "restart_web",
    label: "Restart web",
    description: "Disabled until remote execution safety and confirmations are added.",
    enabled: false,
  },
  {
    id: "build_web",
    label: "Build web",
    description: "Disabled until controlled remote build execution is added.",
    enabled: false,
  },
  {
    id: "full_deploy",
    label: "Full deploy",
    description: "Disabled until end-to-end deploy orchestration and safety checks are in place.",
    enabled: false,
  },
];

function parseRuntimeDetails(value: Prisma.JsonValue | null): RuntimeDetailSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as RuntimeDetailSnapshot;
}

export function getRuntimeSnapshot(project: RuntimeProject): RuntimeSnapshot {
  const details = parseRuntimeDetails(project.runtimeDetails);

  if (project.deployType !== "droplet") {
    return {
      apiHealthy: project.apiHealthy ?? null,
      webHealthy: project.webHealthy ?? null,
      publicHealthy: project.publicHealthy ?? null,
      overallStatus: (project.runtimeStatus as RuntimeStatus | null) ?? "unknown",
      checkedAt: project.lastRuntimeCheckAt ?? null,
      reason: project.runtimeReason ?? null,
      details,
      actions: [],
      source: project.runtimeStatus ? "stored_snapshot" : "unconfigured",
    };
  }

  return {
    apiHealthy: project.apiHealthy ?? null,
    webHealthy: project.webHealthy ?? null,
    publicHealthy: project.publicHealthy ?? null,
    overallStatus: (project.runtimeStatus as RuntimeStatus | null) ?? "unknown",
    checkedAt: project.lastRuntimeCheckAt ?? null,
    reason: project.runtimeReason ?? null,
    details,
    actions: DROPLET_ACTIONS,
    source: project.runtimeStatus ? "stored_snapshot" : "unconfigured",
  };
}

export function healthSignalLabel(
  target: "api" | "web" | "public",
  healthy: boolean | null,
  details?: RuntimeDetailSnapshot | null,
) {
  const explicitStatus =
    target === "api"
      ? details?.api?.status
      : target === "web"
        ? details?.web?.status
        : details?.public?.status;

  if (explicitStatus) {
    return explicitStatus;
  }

  if (healthy === true) {
    return "healthy";
  }

  if (healthy === false) {
    return target === "public" ? "degraded" : "unhealthy";
  }

  return "unknown";
}
