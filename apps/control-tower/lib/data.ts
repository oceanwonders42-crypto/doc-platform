import {
  Prisma,
  type AssignedAgent,
  type TaskExecutionMode,
  type TaskExecutionStatus,
  type TaskPriority,
  type TaskStatus,
} from "@prisma/client";

import { getGitHubConnectionInfo } from "@/lib/integrations/github";
import { prisma } from "@/lib/prisma";
import { getRuntimeSnapshot } from "@/lib/runtime-checks";
import { startOfWeek } from "@/lib/utils";

export type TaskFilters = {
  q?: string;
  projectId?: string;
  status?: TaskStatus;
  executionStatus?: TaskExecutionStatus;
  executionMode?: TaskExecutionMode;
  priority?: TaskPriority;
  agent?: AssignedAgent;
};

function buildTaskWhere(filters: TaskFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { description: { contains: filters.q } },
      { nextStep: { contains: filters.q } },
      { linkedGithubRepo: { contains: filters.q } },
      { project: { name: { contains: filters.q } } },
    ];
  }

  if (filters.projectId) {
    where.projectId = filters.projectId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.executionStatus) {
    where.executionStatus = filters.executionStatus;
  }

  if (filters.executionMode) {
    where.executionMode = filters.executionMode;
  }

  if (filters.priority) {
    where.priority = filters.priority;
  }

  if (filters.agent) {
    where.assignedAgent = filters.agent;
  }

  return where;
}

export async function getDashboardData(filters: Pick<TaskFilters, "executionStatus" | "agent"> = {}) {
  const weekStart = startOfWeek();
  const attentionWhere: Prisma.TaskWhereInput = {
    executionStatus: { not: "done" },
    OR: [
      { executionStatus: "blocked" },
      { executionStatus: "failed" },
      { executionStatus: "review" },
      { executionStatus: "waiting_external" },
      { needsDecision: true },
    ],
  };

  if (filters.executionStatus) {
    attentionWhere.executionStatus = filters.executionStatus;
  }

  if (filters.agent) {
    attentionWhere.assignedAgent = filters.agent;
  }

  const [
    summary,
    githubAggregate,
    projectsMissingRepoLinks,
    runtimeCounts,
    needsAttention,
    openDecisions,
    recentActivity,
    projects,
    recentRepos,
    runtimeProjects,
    integrationState,
    recentJobs,
  ] = await Promise.all([
    prisma.$transaction([
      prisma.project.count({ where: { isActive: true } }),
      prisma.task.count({ where: { executionStatus: "in_progress" } }),
      prisma.task.count({ where: { executionStatus: { in: ["blocked", "failed"] } } }),
      prisma.decisionItem.count({ where: { status: "open" } }),
      prisma.task.count({ where: { executionStatus: "done", updatedAt: { gte: weekStart } } }),
    ]),
    prisma.project.aggregate({
      where: { isActive: true },
      _sum: {
        githubOpenIssueCount: true,
        githubOpenPrCount: true,
      },
    }),
    prisma.project.count({
      where: {
        isActive: true,
        githubRepoId: null,
      },
    }),
    prisma.$transaction([
      prisma.project.count({
        where: {
          isActive: true,
          runtimeStatus: { in: ["degraded", "failed", "unhealthy"] },
        },
      }),
      prisma.project.count({
        where: {
          isActive: true,
          apiHealthy: true,
        },
      }),
    ]),
    prisma.task.findMany({
      where: attentionWhere,
      include: {
        project: true,
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.decisionItem.findMany({
      where: { status: "open" },
      include: { project: true, task: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.activityLog.findMany({
      include: { project: true, task: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.gitHubRepoSnapshot.findMany({
      orderBy: [{ pushedAt: "desc" }, { repoUpdatedAt: "desc" }],
      take: 5,
    }),
    prisma.project.findMany({
      where: {
        isActive: true,
        runtimeStatus: { in: ["degraded", "failed", "unhealthy"] },
      },
      orderBy: [{ lastRuntimeCheckAt: "desc" }, { updatedAt: "desc" }],
      take: 4,
      select: {
        id: true,
        name: true,
        slug: true,
        apiHealthy: true,
        webHealthy: true,
        publicHealthy: true,
        runtimeStatus: true,
        runtimeReason: true,
        runtimeDetails: true,
        lastRuntimeCheckAt: true,
        deployType: true,
      },
    }),
    prisma.integrationState.findUnique({
      where: { provider: "github" },
    }),
    prisma.automationJob.findMany({
      include: {
        project: {
          select: {
            slug: true,
            name: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return {
    summary: {
      activeProjects: summary[0],
      tasksInProgress: summary[1],
      blockedTasks: summary[2],
      openDecisions: summary[3],
      completedThisWeek: summary[4],
      githubOpenIssues: githubAggregate._sum.githubOpenIssueCount ?? 0,
      githubOpenPrs: githubAggregate._sum.githubOpenPrCount ?? 0,
      projectsMissingRepoLinks,
      degradedRuntimeProjects: runtimeCounts[0],
      apiHealthyProjects: runtimeCounts[1],
    },
    needsAttention,
    openDecisions,
    recentActivity,
    projects,
    recentRepos,
    recentJobs,
    runtimeProjects: runtimeProjects.map((project) => ({
      ...project,
      runtime: getRuntimeSnapshot(project),
    })),
    githubConnection: getGitHubConnectionInfo(),
    githubIntegrationState: integrationState,
  };
}

export async function getProjectsPageData() {
  const [projects, repoSnapshots, integrationState] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            tasks: true,
            decisions: true,
          },
        },
        tasks: {
          select: {
            executionStatus: true,
          },
        },
      },
    }),
    prisma.gitHubRepoSnapshot.findMany({
      orderBy: [{ repoUpdatedAt: "desc" }, { fullName: "asc" }],
      take: 20,
    }),
    prisma.integrationState.findUnique({
      where: { provider: "github" },
    }),
  ]);

  const linkedRepoKeys = new Set(
    projects.flatMap((project) => [project.githubRepoId, project.repoName, project.repoUrl].filter(Boolean) as string[]),
  );

  const importableRepos = repoSnapshots.filter(
    (repo) => !linkedRepoKeys.has(repo.githubRepoId) && !linkedRepoKeys.has(repo.fullName) && !linkedRepoKeys.has(repo.htmlUrl),
  );

  return {
    projects,
    importableRepos,
    githubConnection: getGitHubConnectionInfo(),
    githubIntegrationState: integrationState,
  };
}

export async function getProjectDetailPageData(slug: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      tasks: {
        orderBy: [{ executionStatus: "asc" }, { updatedAt: "desc" }],
        include: {
          prompts: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          events: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
      decisions: {
        orderBy: { updatedAt: "desc" },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
      automationJobs: {
        orderBy: { createdAt: "desc" },
        take: 6,
      },
    },
  });

  if (!project) {
    return null;
  }

  const [repoSnapshot, issueSnapshots, pullRequestSnapshots, integrationState] = await Promise.all([
    project.githubRepoId
      ? prisma.gitHubRepoSnapshot.findUnique({
          where: { githubRepoId: project.githubRepoId },
        })
      : Promise.resolve(null),
    prisma.gitHubIssueSnapshot.findMany({
      where: { projectId: project.id },
      orderBy: { issueUpdatedAt: "desc" },
      take: 12,
    }),
    prisma.gitHubPullRequestSnapshot.findMany({
      where: { projectId: project.id },
      orderBy: { pullRequestUpdatedAt: "desc" },
      take: 12,
    }),
    prisma.integrationState.findUnique({
      where: { provider: "github" },
    }),
  ]);

  return {
    project,
    repoSnapshot,
    issueSnapshots,
    pullRequestSnapshots,
    runtime: getRuntimeSnapshot(project),
    githubConnection: getGitHubConnectionInfo(),
    githubIntegrationState: integrationState,
  };
}

export async function getProjectFormData(slug?: string) {
  return slug
    ? prisma.project.findUnique({
        where: { slug },
      })
    : null;
}

export async function getTaskBoard(filters: TaskFilters = {}) {
  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: buildTaskWhere(filters),
      include: {
        project: true,
        linkedProject: true,
        events: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        prompts: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ executionStatus: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { tasks, projects };
}

export async function getTaskDetailPageData(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: true,
      linkedProject: true,
      decisions: {
        orderBy: { updatedAt: "desc" },
      },
      events: {
        orderBy: { createdAt: "desc" },
      },
      prompts: {
        orderBy: { createdAt: "desc" },
      },
      automationJobs: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!task) {
    return null;
  }

  return {
    task,
    runtime: getRuntimeSnapshot(task.project),
  };
}

export async function getTaskFormData(id?: string) {
  const [task, projects] = await Promise.all([
    id
      ? prisma.task.findUnique({
          where: { id },
          include: { project: true, linkedProject: true },
        })
      : Promise.resolve(null),
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  return { task, projects };
}

export async function getDecisions(status?: "open" | "resolved") {
  const [decisions, projects, tasks] = await Promise.all([
    prisma.decisionItem.findMany({
      where: status ? { status } : undefined,
      include: { project: true, task: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.task.findMany({
      where: { executionStatus: { not: "done" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
      take: 30,
    }),
  ]);

  return { decisions, projects, tasks };
}

export async function getDecisionFormData(id?: string) {
  const [decision, projects, tasks] = await Promise.all([
    id
      ? prisma.decisionItem.findUnique({
          where: { id },
          include: {
            project: {
              select: { slug: true },
            },
          },
        })
      : Promise.resolve(null),
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.task.findMany({
      where: { executionStatus: { not: "done" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
      take: 30,
    }),
  ]);

  return { decision, projects, tasks };
}

export async function getSettingsPageData() {
  const [integrationState, repoCount, linkedProjectCount, issueCount, pullRequestCount, automationJobCount] = await Promise.all([
    prisma.integrationState.findUnique({
      where: { provider: "github" },
    }),
    prisma.gitHubRepoSnapshot.count(),
    prisma.project.count({
      where: {
        githubRepoId: { not: null },
      },
    }),
    prisma.gitHubIssueSnapshot.count(),
    prisma.gitHubPullRequestSnapshot.count(),
    prisma.automationJob.count(),
  ]);

  return {
    githubConnection: getGitHubConnectionInfo(),
    githubIntegrationState: integrationState,
    githubRepoCount: repoCount,
    linkedProjectCount,
    githubIssueCount: issueCount,
    githubPullRequestCount: pullRequestCount,
    automationJobCount,
  };
}
