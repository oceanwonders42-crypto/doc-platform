import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { getGitHubConnectionInfo, getGitHubProvider, describeGitHubError, type GitHubRepository } from "@/lib/integrations/github";
import { reconcileGitHubLinkedTasks } from "@/lib/task-ops";
import { slugify } from "@/lib/utils";

type SyncStatus = "success" | "partial" | "error" | "mock";

type SyncProjectInput = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repoName: string;
  repoUrl: string;
  githubRepoId: string | null;
};

type SyncResult = {
  ok: boolean;
  status: SyncStatus;
  message: string;
};

function getIntegrationDefaults() {
  const connection = getGitHubConnectionInfo();

  return {
    provider: "github",
    owner: connection.owner,
    mode: connection.mode,
  };
}

async function updateIntegrationState(input: {
  status: string;
  lastSyncAt?: Date | null;
  lastSyncMessage?: string | null;
  lastSyncError?: string | null;
}) {
  const defaults = getIntegrationDefaults();

  await prisma.integrationState.upsert({
    where: { provider: "github" },
    update: {
      owner: defaults.owner,
      mode: defaults.mode,
      status: input.status,
      lastSyncAt: input.lastSyncAt ?? undefined,
      lastSyncMessage: input.lastSyncMessage ?? undefined,
      lastSyncError: input.lastSyncError ?? undefined,
    },
    create: {
      provider: "github",
      owner: defaults.owner,
      mode: defaults.mode,
      status: input.status,
      lastSyncAt: input.lastSyncAt ?? undefined,
      lastSyncMessage: input.lastSyncMessage ?? undefined,
      lastSyncError: input.lastSyncError ?? undefined,
    },
  });
}

function matchProjectForRepo(
  repo: GitHubRepository,
  projects: SyncProjectInput[],
) {
  return (
    projects.find((project) => project.githubRepoId === repo.id) ??
    projects.find((project) => project.repoName.toLowerCase() === repo.fullName.toLowerCase()) ??
    projects.find((project) => project.repoUrl.toLowerCase() === repo.htmlUrl.toLowerCase()) ??
    null
  );
}

async function upsertRepoSnapshot(repo: GitHubRepository, lastSyncAt: Date) {
  await prisma.gitHubRepoSnapshot.upsert({
    where: { githubRepoId: repo.id },
    update: {
      githubNodeId: repo.nodeId,
      ownerLogin: repo.ownerLogin,
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      htmlUrl: repo.htmlUrl,
      defaultBranch: repo.defaultBranch,
      isPrivate: repo.isPrivate,
      visibility: repo.visibility,
      pushedAt: repo.pushedAt ? new Date(repo.pushedAt) : null,
      repoUpdatedAt: new Date(repo.updatedAt),
      lastSyncAt,
    },
    create: {
      githubRepoId: repo.id,
      githubNodeId: repo.nodeId,
      ownerLogin: repo.ownerLogin,
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      htmlUrl: repo.htmlUrl,
      defaultBranch: repo.defaultBranch,
      isPrivate: repo.isPrivate,
      visibility: repo.visibility,
      pushedAt: repo.pushedAt ? new Date(repo.pushedAt) : null,
      repoUpdatedAt: new Date(repo.updatedAt),
      lastSyncAt,
    },
  });
}

async function hydrateProjectFromRepo(
  project: SyncProjectInput,
  repo: GitHubRepository,
  lastSyncAt: Date,
) {
  const provider = getGitHubProvider();

  try {
    const [issues, pullRequests] = await Promise.all([
      provider.listOpenIssues(repo.fullName),
      provider.listOpenPullRequests(repo.fullName),
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: {
          description: project.description ?? repo.description,
          repoUrl: repo.htmlUrl,
          repoName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          githubRepoId: repo.id,
          lastGithubSyncAt: lastSyncAt,
          githubSyncStatus: provider.getConnectionInfo().mode === "mock" ? "mock" : "success",
          githubSyncError: null,
          githubOpenIssueCount: issues.length,
          githubOpenPrCount: pullRequests.length,
          githubLastActivityAt: repo.pushedAt ? new Date(repo.pushedAt) : new Date(repo.updatedAt),
        },
      });

      await tx.gitHubRepoSnapshot.upsert({
        where: { githubRepoId: repo.id },
        update: {
          githubNodeId: repo.nodeId,
          ownerLogin: repo.ownerLogin,
          name: repo.name,
          fullName: repo.fullName,
          description: repo.description,
          htmlUrl: repo.htmlUrl,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          visibility: repo.visibility,
          pushedAt: repo.pushedAt ? new Date(repo.pushedAt) : null,
          repoUpdatedAt: new Date(repo.updatedAt),
          openIssueCount: issues.length,
          openPullRequestCount: pullRequests.length,
          lastSyncAt,
        },
        create: {
          githubRepoId: repo.id,
          githubNodeId: repo.nodeId,
          ownerLogin: repo.ownerLogin,
          name: repo.name,
          fullName: repo.fullName,
          description: repo.description,
          htmlUrl: repo.htmlUrl,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          visibility: repo.visibility,
          pushedAt: repo.pushedAt ? new Date(repo.pushedAt) : null,
          repoUpdatedAt: new Date(repo.updatedAt),
          openIssueCount: issues.length,
          openPullRequestCount: pullRequests.length,
          lastSyncAt,
        },
      });

      await tx.gitHubIssueSnapshot.deleteMany({
        where: { projectId: project.id },
      });

      await tx.gitHubPullRequestSnapshot.deleteMany({
        where: { projectId: project.id },
      });

      if (issues.length > 0) {
        await tx.gitHubIssueSnapshot.createMany({
          data: issues.map((issue) => ({
            projectId: project.id,
            githubIssueId: issue.id,
            number: issue.number,
            title: issue.title,
            state: issue.state,
            url: issue.url,
            authorLogin: issue.authorLogin,
            issueUpdatedAt: new Date(issue.updatedAt),
            lastSyncAt,
          })),
        });
      }

      if (pullRequests.length > 0) {
        await tx.gitHubPullRequestSnapshot.createMany({
          data: pullRequests.map((pullRequest) => ({
            projectId: project.id,
            githubPullRequestId: pullRequest.id,
            number: pullRequest.number,
            title: pullRequest.title,
            state: pullRequest.state,
            url: pullRequest.url,
            authorLogin: pullRequest.authorLogin,
            headRefName: pullRequest.headRefName,
            pullRequestUpdatedAt: new Date(pullRequest.updatedAt),
            lastSyncAt,
          })),
        });
      }
    });

    return {
      ok: true,
      status: provider.getConnectionInfo().mode === "mock" ? "mock" : "success",
      message: `Synced ${repo.fullName} with ${issues.length} issues and ${pullRequests.length} pull requests.`,
    } satisfies SyncResult;
  } catch (error) {
    const message = describeGitHubError(error);

    await prisma.project.update({
      where: { id: project.id },
      data: {
        githubRepoId: repo.id,
        lastGithubSyncAt: lastSyncAt,
        githubSyncStatus: "error",
        githubSyncError: message,
      },
    });

    await logActivity({
      projectId: project.id,
      type: "github.sync.failed",
      message: `GitHub sync failed for ${project.name}.`,
      metadata: {
        repo: repo.fullName,
        error: message,
      },
    });

    return {
      ok: false,
      status: "error",
      message,
    } satisfies SyncResult;
  }
}

async function getProjectForSync(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      repoName: true,
      repoUrl: true,
      githubRepoId: true,
    },
  });
}

export async function syncAllGitHubData() {
  const provider = getGitHubProvider();
  const connection = provider.getConnectionInfo();
  const lastSyncAt = new Date();

  await updateIntegrationState({
    status: "running",
    lastSyncMessage: `GitHub sync started in ${connection.mode} mode.`,
    lastSyncError: null,
  });

  await logActivity({
    type: "github.sync.started",
    message: `GitHub sync started for ${connection.owner ?? "mock fallback"}.`,
    metadata: {
      mode: connection.mode,
      owner: connection.owner,
    },
  });

  try {
    const [repos, projects] = await Promise.all([
      provider.listRepositories(),
      prisma.project.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          repoName: true,
          repoUrl: true,
          githubRepoId: true,
        },
      }),
    ]);

    const syncedRepoIds = new Set<string>();
    let linkedProjects = 0;
    let failedProjects = 0;
    let unlinkedRepos = 0;

    for (const repo of repos) {
      syncedRepoIds.add(repo.id);
      await upsertRepoSnapshot(repo, lastSyncAt);

      const matchedProject = matchProjectForRepo(repo, projects);

      if (!matchedProject) {
        unlinkedRepos += 1;
        continue;
      }

      const result = await hydrateProjectFromRepo(matchedProject, repo, lastSyncAt);

      if (result.ok) {
        await reconcileGitHubLinkedTasks(matchedProject.id);
        linkedProjects += 1;
      } else {
        failedProjects += 1;
      }
    }

    if (connection.owner) {
      await prisma.gitHubRepoSnapshot.deleteMany({
        where: {
          ownerLogin: connection.owner,
          githubRepoId: {
            notIn: Array.from(syncedRepoIds),
          },
        },
      });
    }

    const status =
      failedProjects === 0
        ? connection.mode === "mock"
          ? "mock"
          : "success"
        : linkedProjects > 0
          ? "partial"
          : "error";

    const message = `Synced ${repos.length} repos. ${linkedProjects} linked projects refreshed. ${unlinkedRepos} repos ready to import.`;

    await updateIntegrationState({
      status,
      lastSyncAt,
      lastSyncMessage: message,
      lastSyncError: failedProjects > 0 ? `${failedProjects} project syncs failed.` : null,
    });

    await logActivity({
      type: "github.sync.completed",
      message,
      metadata: {
        mode: connection.mode,
        repos: repos.length,
        linkedProjects,
        unlinkedRepos,
        failedProjects,
      },
    });

    return {
      ok: failedProjects === 0,
      status,
      repos: repos.length,
      linkedProjects,
      unlinkedRepos,
      failedProjects,
      message,
    };
  } catch (error) {
    const message = describeGitHubError(error);

    await updateIntegrationState({
      status: "error",
      lastSyncAt,
      lastSyncMessage: "GitHub sync failed.",
      lastSyncError: message,
    });

    await logActivity({
      type: "github.sync.failed",
      message: "GitHub sync failed.",
      metadata: {
        mode: connection.mode,
        owner: connection.owner,
        error: message,
      },
    });

    return {
      ok: false,
      status: "error" as const,
      repos: 0,
      linkedProjects: 0,
      unlinkedRepos: 0,
      failedProjects: 0,
      message,
    };
  }
}

export async function syncGitHubProject(projectId: string) {
  const project = await getProjectForSync(projectId);

  if (!project) {
    return {
      ok: false,
      status: "error" as const,
      message: "Project not found.",
    };
  }

  const provider = getGitHubProvider();
  const connection = provider.getConnectionInfo();
  const lastSyncAt = new Date();
  const repoSnapshot =
    project.githubRepoId
      ? await prisma.gitHubRepoSnapshot.findUnique({
          where: { githubRepoId: project.githubRepoId },
        })
      : null;

  const repoIdentifier = repoSnapshot?.fullName ?? project.repoName ?? project.repoUrl;
  const repo = await provider.getRepository(repoIdentifier);

  if (!repo) {
    const message = "Linked GitHub repository could not be found during sync.";

    await prisma.project.update({
      where: { id: project.id },
      data: {
        lastGithubSyncAt: lastSyncAt,
        githubSyncStatus: "error",
        githubSyncError: message,
      },
    });

    await updateIntegrationState({
      status: "error",
      lastSyncAt,
      lastSyncMessage: `GitHub sync failed for ${project.name}.`,
      lastSyncError: message,
    });

    return {
      ok: false,
      status: "error" as const,
      message,
    };
  }

  const result = await hydrateProjectFromRepo(project, repo, lastSyncAt);

  await updateIntegrationState({
    status: result.status,
    lastSyncAt,
    lastSyncMessage: `${project.name} GitHub data refreshed in ${connection.mode} mode.`,
    lastSyncError: result.ok ? null : result.message,
  });

  if (result.ok) {
    await reconcileGitHubLinkedTasks(project.id);
    await logActivity({
      projectId: project.id,
      type: "github.project_synced",
      message: `GitHub data refreshed for ${project.name}.`,
      metadata: {
        repo: repo.fullName,
        mode: connection.mode,
      },
    });
  }

  return result;
}

async function createUniqueProjectSlug(baseSlug: string) {
  let slug = baseSlug;
  let counter = 2;

  while (await prisma.project.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

export async function importGitHubRepo(githubRepoId: string) {
  const snapshot = await prisma.gitHubRepoSnapshot.findUnique({
    where: { githubRepoId },
  });

  if (!snapshot) {
    return {
      ok: false,
      status: "error" as const,
      message: "Repository snapshot not found. Run sync first.",
      projectSlug: null,
    };
  }

  const existingProject = await prisma.project.findFirst({
    where: {
      OR: [
        { githubRepoId: snapshot.githubRepoId },
        { repoName: snapshot.fullName },
        { repoUrl: snapshot.htmlUrl },
      ],
    },
    select: {
      slug: true,
      id: true,
    },
  });

  if (existingProject) {
    return {
      ok: true,
      status: "success" as const,
      message: "Repository is already linked to a project.",
      projectSlug: existingProject.slug,
    };
  }

  const slug = await createUniqueProjectSlug(slugify(snapshot.name));
  const project = await prisma.project.create({
    data: {
      name: snapshot.name,
      slug,
      description: snapshot.description,
      repoUrl: snapshot.htmlUrl,
      repoName: snapshot.fullName,
      defaultBranch: snapshot.defaultBranch,
      deployType: "other",
      deployTargetName: "unassigned",
      deployTargetIdOrHost: "pending",
      environment: "dev",
      isActive: true,
      githubRepoId: snapshot.githubRepoId,
      lastGithubSyncAt: snapshot.lastSyncAt,
      githubSyncStatus: "success",
      githubSyncError: null,
      githubOpenIssueCount: snapshot.openIssueCount,
      githubOpenPrCount: snapshot.openPullRequestCount,
      githubLastActivityAt: snapshot.pushedAt ?? snapshot.repoUpdatedAt,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      repoName: true,
      repoUrl: true,
      githubRepoId: true,
    },
  });

  await logActivity({
    projectId: project.id,
    type: "github.repo_imported",
    message: `Imported ${snapshot.fullName} as a project.`,
    metadata: {
      repo: snapshot.fullName,
      githubRepoId: snapshot.githubRepoId,
    },
  });

  await syncGitHubProject(project.id);

  return {
    ok: true,
    status: "success" as const,
    message: `Imported ${snapshot.fullName}.`,
    projectSlug: project.slug,
  };
}
