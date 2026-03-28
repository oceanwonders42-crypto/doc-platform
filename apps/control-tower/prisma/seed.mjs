import { PrismaClient } from "@prisma/client";

import { loadLocalEnv } from "./load-env.mjs";
import { automationJobSeeds, decisionSeeds, projectSeeds, taskPromptSeeds, taskSeeds } from "./seed-data.mjs";

loadLocalEnv();
const prisma = new PrismaClient();

function buildTaskTimestamps(executionStatus) {
  const now = new Date();

  return {
    startedAt:
      executionStatus === "in_progress" || executionStatus === "review" || executionStatus === "done"
        ? now
        : null,
    completedAt: executionStatus === "done" ? now : null,
    failedAt: executionStatus === "failed" ? now : null,
  };
}

try {
  await prisma.integrationState.deleteMany();
  await prisma.gitHubPullRequestSnapshot.deleteMany();
  await prisma.gitHubIssueSnapshot.deleteMany();
  await prisma.gitHubRepoSnapshot.deleteMany();
  await prisma.automationJob.deleteMany();
  await prisma.taskPrompt.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.decisionItem.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();

  const projectMap = new Map();
  const taskMap = new Map();

  for (const project of projectSeeds) {
    const created = await prisma.project.create({ data: project });
    projectMap.set(created.slug, created);

    if (project.runtimeStatus) {
      await prisma.activityLog.create({
        data: {
          projectId: created.id,
          type: "runtime.status.updated",
          message: `Runtime status updated for ${created.name}: ${project.runtimeStatus}.`,
          metadata: {
            apiHealthy: project.apiHealthy ?? null,
            webHealthy: project.webHealthy ?? null,
            publicHealthy: project.publicHealthy ?? null,
            checkedAt: project.lastRuntimeCheckAt ?? null,
          },
        },
      });

      if (project.runtimeReason) {
        await prisma.activityLog.create({
          data: {
            projectId: created.id,
            type: "runtime.issue.detected",
            message: project.runtimeReason,
            metadata: {
              cause: project.runtimeDetails?.cause ?? null,
            },
          },
        });
      }
    }
  }

  for (const task of taskSeeds) {
    const project = projectMap.get(task.projectSlug);

    if (!project) {
      continue;
    }

    const timestamps = buildTaskTimestamps(task.executionStatus);
    const created = await prisma.task.create({
      data: {
        projectId: project.id,
        linkedProjectId: project.id,
        title: task.title,
        description: task.description,
        status: task.status,
        executionMode: task.executionMode,
        executionStatus: task.executionStatus,
        priority: task.priority,
        assignedAgent: task.assignedAgent,
        linkedGithubRepo: task.linkedGithubRepo,
        githubIssueUrl: task.githubIssueUrl,
        githubPrUrl: task.githubPrUrl,
        deployUrl: task.deployUrl,
        branchName: task.branchName,
        linkedGithubIssueNumber: task.githubIssueUrl ? Number.parseInt(task.githubIssueUrl.split("/").pop(), 10) : null,
        linkedGithubPrNumber: task.githubPrUrl ? Number.parseInt(task.githubPrUrl.split("/").pop(), 10) : null,
        linkedGithubBranch: task.linkedGithubBranch ?? task.branchName,
        linkedCommitSha: task.linkedCommitSha ?? null,
        startedAt: timestamps.startedAt,
        completedAt: timestamps.completedAt,
        failedAt: timestamps.failedAt,
        lastExternalUpdateAt: new Date("2026-03-19T20:20:00Z"),
        blockedReason: task.blockedReason,
        needsDecision: task.needsDecision,
        nextStep: task.nextStep,
      },
    });

    taskMap.set(created.title, created);

    await prisma.taskEvent.create({
      data: {
        taskId: created.id,
        projectId: project.id,
        type: "task.seeded",
        title: "Seeded Task",
        message: `Seeded task: ${created.title}`,
        source: "system",
        toExecutionStatus: created.executionStatus,
        metadata: {
          assignedAgent: created.assignedAgent,
          executionMode: created.executionMode,
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        projectId: project.id,
        taskId: created.id,
        type: "task.seeded",
        message: `Seeded task: ${created.title}`,
        metadata: {
          assignedAgent: created.assignedAgent,
          executionStatus: created.executionStatus,
        },
      },
    });
  }

  for (const prompt of taskPromptSeeds) {
    const task = taskMap.get(prompt.taskTitle);

    if (!task) {
      continue;
    }

    await prisma.taskPrompt.create({
      data: {
        taskId: task.id,
        targetAgent: prompt.targetAgent,
        contextSummary: prompt.contextSummary,
        prompt: prompt.prompt,
      },
    });
  }

  for (const decision of decisionSeeds) {
    const project = projectMap.get(decision.projectSlug);

    if (!project) {
      continue;
    }

    const created = await prisma.decisionItem.create({
      data: {
        projectId: project.id,
        title: decision.title,
        description: decision.description,
        status: decision.status,
        resolution: decision.resolution,
      },
    });

    await prisma.activityLog.create({
      data: {
        projectId: project.id,
        type: "decision.seeded",
        message: `Seeded decision: ${created.title}`,
      },
    });
  }

  for (const job of automationJobSeeds) {
    const project = job.projectSlug ? projectMap.get(job.projectSlug) : null;
    const task = job.taskTitle ? taskMap.get(job.taskTitle) : null;

    await prisma.automationJob.create({
      data: {
        action: job.action,
        status: job.status,
        projectId: project?.id ?? null,
        taskId: task?.id ?? null,
        scopeLabel: job.scopeLabel,
        message: job.message,
        errorMessage: job.errorMessage ?? null,
        requestedBy: "seed",
        startedAt: new Date("2026-03-19T20:10:00Z"),
        completedAt: new Date("2026-03-19T20:12:00Z"),
      },
    });
  }

  const seededProjects = await prisma.project.findMany({
    include: {
      tasks: true,
      decisions: true,
    },
  });

  for (const project of seededProjects) {
    await prisma.activityLog.create({
      data: {
        projectId: project.id,
        type: "project.seeded",
        message: `${project.name} is ready with ${project.tasks.length} tasks and ${project.decisions.length} decisions.`,
      },
    });
  }

  console.log("Demo data seeded.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
