import type { Project } from "@prisma/client";

export type DigitalOceanTargetSummary = {
  targetLabel: string;
  status: "healthy" | "degraded" | "not_configured";
  deployMode: string;
  lastDeployLabel: string;
};

export interface DigitalOceanProvider {
  getTargetSummary(project: Project): Promise<DigitalOceanTargetSummary>;
}

class MockDigitalOceanProvider implements DigitalOceanProvider {
  async getTargetSummary(project: Project): Promise<DigitalOceanTargetSummary> {
    if (!project.deployTargetIdOrHost) {
      return {
        targetLabel: "Not configured",
        status: "not_configured",
        deployMode: "Awaiting configuration",
        lastDeployLabel: "No deploy target",
      };
    }

    return {
      targetLabel: project.deployTargetIdOrHost,
      status: project.healthCheckUrl ? "healthy" : "degraded",
      deployMode:
        project.deployType === "app_platform"
          ? "Container image via App Platform"
          : project.deployType === "droplet"
            ? "Docker Compose over SSH"
            : "Custom operator flow",
      lastDeployLabel: "Mock deployment snapshot",
    };
  }
}

export const digitalOceanProvider: DigitalOceanProvider = new MockDigitalOceanProvider();
