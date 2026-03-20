type GitHubRepositoryApi = {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  private: boolean;
  visibility?: string;
  updated_at: string;
  pushed_at: string | null;
  open_issues_count: number;
  owner: {
    login: string;
  };
};

type GitHubIssueApi = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  closed_at?: string | null;
  user: {
    login: string;
  } | null;
  pull_request?: Record<string, unknown>;
};

type GitHubPullRequestApi = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  draft?: boolean;
  merged_at?: string | null;
  user: {
    login: string;
  } | null;
  head: {
    ref: string;
    sha?: string;
  };
};

type GitHubCombinedStatusApi = {
  state: "success" | "failure" | "pending";
};

export type GitHubSyncMode = "live" | "mock";

export type GitHubConnectionInfo = {
  mode: GitHubSyncMode;
  owner: string | null;
  apiBaseUrl: string;
  tokenConfigured: boolean;
  ready: boolean;
  message: string;
};

export type GitHubRepository = {
  id: string;
  nodeId: string;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  visibility: string | null;
  updatedAt: string;
  pushedAt: string | null;
  openIssueCount: number;
  ownerLogin: string;
};

export type GitHubIssue = {
  id: string;
  number: number;
  title: string;
  state: string;
  url: string;
  updatedAt: string;
  closedAt: string | null;
  authorLogin: string | null;
};

export type GitHubCheckStatus = "success" | "failure" | "pending" | "unknown";

export type GitHubPullRequest = {
  id: string;
  number: number;
  title: string;
  state: string;
  url: string;
  updatedAt: string;
  authorLogin: string | null;
  draft: boolean;
  mergedAt: string | null;
  headRefName: string | null;
  headSha: string | null;
  checkStatus: GitHubCheckStatus;
};

export class GitHubApiError extends Error {
  status: number;
  isRateLimit: boolean;

  constructor(message: string, status: number, isRateLimit = false) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.isRateLimit = isRateLimit;
  }
}

export interface GitHubProvider {
  getConnectionInfo(): GitHubConnectionInfo;
  listRepositories(): Promise<GitHubRepository[]>;
  getRepository(repoIdentifier: string): Promise<GitHubRepository | null>;
  listOpenIssues(repoIdentifier: string): Promise<GitHubIssue[]>;
  listOpenPullRequests(repoIdentifier: string): Promise<GitHubPullRequest[]>;
  getIssue(repoIdentifier: string, issueNumber: number): Promise<GitHubIssue | null>;
  getPullRequest(repoIdentifier: string, pullRequestNumber: number): Promise<GitHubPullRequest | null>;
}

function mapRepository(repo: GitHubRepositoryApi): GitHubRepository {
  return {
    id: String(repo.id),
    nodeId: repo.node_id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    isPrivate: repo.private,
    visibility: repo.visibility ?? null,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at,
    openIssueCount: repo.open_issues_count,
    ownerLogin: repo.owner.login,
  };
}

function mapIssue(issue: GitHubIssueApi): GitHubIssue {
  return {
    id: String(issue.id),
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at ?? null,
    authorLogin: issue.user?.login ?? null,
  };
}

function mapPullRequest(
  pullRequest: GitHubPullRequestApi,
  checkStatus: GitHubCheckStatus = "unknown",
): GitHubPullRequest {
  return {
    id: String(pullRequest.id),
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    url: pullRequest.html_url,
    updatedAt: pullRequest.updated_at,
    authorLogin: pullRequest.user?.login ?? null,
    draft: pullRequest.draft ?? false,
    mergedAt: pullRequest.merged_at ?? null,
    headRefName: pullRequest.head.ref ?? null,
    headSha: pullRequest.head.sha ?? null,
    checkStatus,
  };
}

function normalizeRepoIdentifier(repoIdentifier: string, owner: string | null) {
  const trimmed = repoIdentifier.trim();

  if (trimmed.startsWith("https://github.com/")) {
    const pathname = new URL(trimmed).pathname.replace(/^\/|\/$/g, "");
    const [parsedOwner, repo] = pathname.split("/");
    return {
      owner: parsedOwner || owner,
      repo,
      fullName: parsedOwner && repo ? `${parsedOwner}/${repo}` : null,
    };
  }

  if (trimmed.includes("/")) {
    const [parsedOwner, repo] = trimmed.split("/");
    return {
      owner: parsedOwner || owner,
      repo,
      fullName: parsedOwner && repo ? `${parsedOwner}/${repo}` : null,
    };
  }

  return {
    owner,
    repo: trimmed,
    fullName: owner ? `${owner}/${trimmed}` : null,
  };
}

function buildMockRepository(owner: string, name: string, offsetHours: number): GitHubRepository {
  const now = Date.now();

  return {
    id: `mock-${owner}-${name}`,
    nodeId: `mock-node-${owner}-${name}`,
    name,
    fullName: `${owner}/${name}`,
    description: `${name} repository in mock fallback mode.`,
    htmlUrl: `https://github.com/${owner}/${name}`,
    defaultBranch: "main",
    isPrivate: true,
    visibility: "private",
    updatedAt: new Date(now - offsetHours * 60 * 60 * 1000).toISOString(),
    pushedAt: new Date(now - Math.max(1, offsetHours - 1) * 60 * 60 * 1000).toISOString(),
    openIssueCount: (name.length % 4) + 1,
    ownerLogin: owner,
  };
}

function buildMockIssue(repo: GitHubRepository, number: number): GitHubIssue {
  return {
    id: `mock-issue-${repo.name}-${number}`,
    number,
    title: `${repo.name}: issue ${number}`,
    state: number % 5 === 0 ? "closed" : "open",
    url: `${repo.htmlUrl}/issues/${number}`,
    updatedAt: new Date(Date.now() - number * 45 * 60 * 1000).toISOString(),
    closedAt: number % 5 === 0 ? new Date(Date.now() - number * 15 * 60 * 1000).toISOString() : null,
    authorLogin: number % 2 === 0 ? "codex" : "claude",
  };
}

function buildMockPullRequest(repo: GitHubRepository, number: number): GitHubPullRequest {
  const draft = number % 3 === 0;
  const mergedAt = number % 5 === 0 ? new Date(Date.now() - number * 10 * 60 * 1000).toISOString() : null;

  return {
    id: `mock-pr-${repo.name}-${number}`,
    number,
    title: `${repo.name}: PR ${number}`,
    state: mergedAt ? "closed" : "open",
    url: `${repo.htmlUrl}/pull/${number}`,
    updatedAt: new Date(Date.now() - number * 70 * 60 * 1000).toISOString(),
    authorLogin: number % 2 === 0 ? "cursor" : "codex",
    draft,
    mergedAt,
    headRefName: `feature/${repo.name}-${number}`,
    headSha: `mocksha${repo.name}${number}`.slice(0, 16),
    checkStatus: mergedAt ? "success" : number % 4 === 0 ? "failure" : draft ? "pending" : "success",
  };
}

class MockGitHubProvider implements GitHubProvider {
  private connectionInfo: GitHubConnectionInfo;
  private repositories: GitHubRepository[];

  constructor() {
    const owner = process.env.GITHUB_OWNER?.trim() || "onyx-internal";

    this.connectionInfo = {
      mode: "mock",
      owner,
      apiBaseUrl: process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com",
      tokenConfigured: Boolean(process.env.GITHUB_TOKEN?.trim()),
      ready: false,
      message: "GitHub env vars are missing. Using mock fallback data.",
    };

    this.repositories = [
      buildMockRepository(owner, "doc-platform", 2),
      buildMockRepository(owner, "marketing-site", 5),
      buildMockRepository(owner, "client-portal", 8),
      buildMockRepository(owner, "automations", 12),
    ];
  }

  getConnectionInfo() {
    return this.connectionInfo;
  }

  async listRepositories() {
    return this.repositories;
  }

  async getRepository(repoIdentifier: string) {
    const normalized = normalizeRepoIdentifier(repoIdentifier, this.connectionInfo.owner);

    return (
      this.repositories.find(
        (repo) =>
          repo.fullName === normalized.fullName ||
          repo.name === normalized.repo ||
          repo.htmlUrl === repoIdentifier,
      ) ?? null
    );
  }

  async listOpenIssues(repoIdentifier: string) {
    const repo = await this.getRepository(repoIdentifier);

    if (!repo) {
      return [];
    }

    return Array.from({ length: Math.max(1, repo.openIssueCount) }, (_, index) =>
      buildMockIssue(repo, index + 1),
    ).filter((issue) => issue.state === "open");
  }

  async listOpenPullRequests(repoIdentifier: string) {
    const repo = await this.getRepository(repoIdentifier);

    if (!repo) {
      return [];
    }

    const count = (repo.name.length % 3) + 1;
    return Array.from({ length: count }, (_, index) => buildMockPullRequest(repo, index + 1)).filter(
      (pullRequest) => pullRequest.state === "open",
    );
  }

  async getIssue(repoIdentifier: string, issueNumber: number) {
    const repo = await this.getRepository(repoIdentifier);

    if (!repo) {
      return null;
    }

    return buildMockIssue(repo, issueNumber);
  }

  async getPullRequest(repoIdentifier: string, pullRequestNumber: number) {
    const repo = await this.getRepository(repoIdentifier);

    if (!repo) {
      return null;
    }

    return buildMockPullRequest(repo, pullRequestNumber);
  }
}

class LiveGitHubProvider implements GitHubProvider {
  private connectionInfo: GitHubConnectionInfo;
  private token: string;

  constructor() {
    const token = process.env.GITHUB_TOKEN?.trim() ?? "";
    const owner = process.env.GITHUB_OWNER?.trim() ?? null;
    const apiBaseUrl = process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com";

    this.token = token;
    this.connectionInfo = {
      mode: "live",
      owner,
      apiBaseUrl,
      tokenConfigured: Boolean(token),
      ready: Boolean(token && owner),
      message: "Live GitHub sync is ready.",
    };
  }

  getConnectionInfo() {
    return this.connectionInfo;
  }

  private getHeaders() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async requestJson<T>(path: string, query?: URLSearchParams) {
    const url = new URL(path, this.connectionInfo.apiBaseUrl.endsWith("/") ? this.connectionInfo.apiBaseUrl : `${this.connectionInfo.apiBaseUrl}/`);

    if (query) {
      url.search = query.toString();
    }

    const response = await fetch(url, {
      headers: this.getHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      const message = body?.message || `GitHub API request failed with status ${response.status}.`;
      const isRateLimit =
        response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";

      throw new GitHubApiError(message, response.status, isRateLimit);
    }

    return (await response.json()) as T;
  }

  private async requestPaginated<T>(path: string, query: URLSearchParams) {
    const results: T[] = [];
    let page = 1;

    while (page <= 10) {
      query.set("page", String(page));
      const pageItems = await this.requestJson<T[]>(path, query);
      results.push(...pageItems);

      if (pageItems.length < Number(query.get("per_page") ?? "100")) {
        break;
      }

      page += 1;
    }

    return results;
  }

  private async getCommitCheckStatus(repoIdentifier: string, sha: string | null | undefined): Promise<GitHubCheckStatus> {
    const normalized = normalizeRepoIdentifier(repoIdentifier, this.connectionInfo.owner);

    if (!normalized.owner || !normalized.repo || !sha) {
      return "unknown";
    }

    try {
      const response = await this.requestJson<GitHubCombinedStatusApi>(
        `repos/${normalized.owner}/${normalized.repo}/commits/${sha}/status`,
      );

      return response.state ?? "unknown";
    } catch {
      return "unknown";
    }
  }

  async listRepositories() {
    if (!this.connectionInfo.owner) {
      return [];
    }

    const query = new URLSearchParams({
      per_page: "100",
      sort: "updated",
      direction: "desc",
    });

    try {
      const repos = await this.requestPaginated<GitHubRepositoryApi>(
        `orgs/${this.connectionInfo.owner}/repos`,
        query,
      );
      return repos.map(mapRepository);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        const repos = await this.requestPaginated<GitHubRepositoryApi>(
          `users/${this.connectionInfo.owner}/repos`,
          query,
        );
        return repos.map(mapRepository);
      }

      throw error;
    }
  }

  async getRepository(repoIdentifier: string) {
    const normalized = normalizeRepoIdentifier(repoIdentifier, this.connectionInfo.owner);

    if (!normalized.owner || !normalized.repo) {
      return null;
    }

    try {
      const repo = await this.requestJson<GitHubRepositoryApi>(
        `repos/${normalized.owner}/${normalized.repo}`,
      );

      return mapRepository(repo);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async listOpenIssues(repoIdentifier: string) {
    const normalized = normalizeRepoIdentifier(repoIdentifier, this.connectionInfo.owner);

    if (!normalized.owner || !normalized.repo) {
      return [];
    }

    const issues = await this.requestPaginated<GitHubIssueApi>(
      `repos/${normalized.owner}/${normalized.repo}/issues`,
      new URLSearchParams({
        state: "open",
        sort: "updated",
        direction: "desc",
        per_page: "100",
      }),
    );

    return issues.filter((issue) => !issue.pull_request).map(mapIssue);
  }

  async listOpenPullRequests(repoIdentifier: string) {
    const normalized = normalizeRepoIdentifier(repoIdentifier, this.connectionInfo.owner);

    if (!normalized.owner || !normalized.repo) {
      return [];
    }

    const pullRequests = await this.requestPaginated<GitHubPullRequestApi>(
      `repos/${normalized.owner}/${normalized.repo}/pulls`,
      new URLSearchParams({
        state: "open",
        sort: "updated",
        direction: "desc",
        per_page: "100",
      }),
    );

    return pullRequests.map((pullRequest) => mapPullRequest(pullRequest));
  }

  async getIssue(repoIdentifier: string, issueNumber: number) {
    const normalized = normalizeRepoIdentifier(repoIdentifier, this.connectionInfo.owner);

    if (!normalized.owner || !normalized.repo) {
      return null;
    }

    try {
      const issue = await this.requestJson<GitHubIssueApi>(
        `repos/${normalized.owner}/${normalized.repo}/issues/${issueNumber}`,
      );

      if (issue.pull_request) {
        return null;
      }

      return mapIssue(issue);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async getPullRequest(repoIdentifier: string, pullRequestNumber: number) {
    const normalized = normalizeRepoIdentifier(repoIdentifier, this.connectionInfo.owner);

    if (!normalized.owner || !normalized.repo) {
      return null;
    }

    try {
      const pullRequest = await this.requestJson<GitHubPullRequestApi>(
        `repos/${normalized.owner}/${normalized.repo}/pulls/${pullRequestNumber}`,
      );
      const checkStatus = await this.getCommitCheckStatus(repoIdentifier, pullRequest.head.sha);

      return mapPullRequest(pullRequest, checkStatus);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }
}

export function getGitHubProvider(): GitHubProvider {
  if (process.env.GITHUB_TOKEN?.trim() && process.env.GITHUB_OWNER?.trim()) {
    return new LiveGitHubProvider();
  }

  return new MockGitHubProvider();
}

export function getGitHubConnectionInfo() {
  return getGitHubProvider().getConnectionInfo();
}

export function describeGitHubError(error: unknown) {
  if (error instanceof GitHubApiError) {
    if (error.status === 401) {
      return "GitHub rejected the token. Check GITHUB_TOKEN and try again.";
    }

    if (error.isRateLimit) {
      return "GitHub rate limit reached. Wait a bit and retry the sync.";
    }

    if (error.status === 404) {
      return "GitHub owner or repository was not found.";
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "GitHub sync failed for an unknown reason.";
}
