import type { AutomationAction, Prisma, TaskPromptTarget } from "@prisma/client";

import { syncAllGitHubData, syncGitHubProject } from "@/lib/github-sync";
import { prisma } from "@/lib/prisma";
import { refreshProjectRuntime } from "@/lib/runtime-refresh";
import {
  generateTaskPrompt,
  reconcileGitHubLinkedTasks,
  reconcileProjectHealth,
} from "@/lib/task-ops";

type RunAutomationJobInput = {
  action: AutomationAction;
  projectId?: string | null;
  taskId?: string | null;
  promptTarget?: TaskPromptTarget | null;
  requestedBy?: string | null;
  scopeLabel?: string | null;
};

async function runAutomationAction(input: RunAutomationJobInput) {
  switch (input.action) {
    case "github_sync":
      return input.projectId ? syncGitHubProject(input.projectId) : syncAllGitHubData();
    case "runtime_refresh":
      if (!input.projectId) {
        throw new Error("runtime_refresh requires a project.");
      }

      return refreshProjectRuntime(input.projectId);
    case "task_status_reconcile":
      if (!input.projectId) {
        throw new Error("task_status_reconcile requires a project.");
      }

      return reconcileGitHubLinkedTasks(input.projectId);
    case "project_health_reconcile":
      if (!input.projectId) {
        throw new Error("project_health_reconcile requires a project.");
      }

      return reconcileProjectHealth(input.projectId);
    case "generate_agent_prompt":
      if (!input.taskId || !input.promptTarget) {
        throw new Error("generate_agent_prompt requires a task and target agent.");
      }

      return generateTaskPrompt(input.taskId, input.promptTarget);
  }
}

export async function runAutomationJob(input: RunAutomationJobInput) {
  const job = await prisma.automationJob.create({
    data: {
      action: input.action,
      status: "queued",
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      promptTarget: input.promptTarget ?? null,
      requestedBy: input.requestedBy ?? "operator",
      scopeLabel: input.scopeLabel ?? null,
    },
  });

  try {
    await prisma.automationJob.update({
      where: { id: job.id },
      data: {
        status: "in_progress",
        startedAt: new Date(),
      },
    });

    const result = await runAutomationAction(input);

    await prisma.automationJob.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        completedAt: new Date(),
        message:
          "message" in result && typeof result.message === "string"
            ? result.message
            : `${input.action} completed successfully.`,
        details: result as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      jobId: job.id,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation job failed.";

    await prisma.automationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: message,
        message,
      },
    });

    return {
      ok: false,
      jobId: job.id,
      message,
    };
  }
}
