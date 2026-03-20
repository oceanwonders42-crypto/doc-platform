import { z } from "zod";

const nullableString = z.string().optional().nullable();
const nullableNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  return value;
}, z.coerce.number().int().optional().nullable());

export const projectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional().nullable(),
  repoUrl: z.string().url(),
  repoName: z.string().min(2),
  defaultBranch: z.string().min(1),
  deployType: z.enum(["droplet", "app_platform", "other"]),
  deployTargetName: z.string().min(2),
  deployTargetIdOrHost: z.string().min(2),
  environment: z.enum(["prod", "staging", "dev"]),
  containerImage: z.string().optional().nullable(),
  containerRegistryUrl: z.string().optional().nullable(),
  publicUrl: z.string().url().optional().nullable(),
  sshHost: z.string().optional().nullable(),
  sshPort: z.number().int().positive().optional().nullable(),
  sshUser: z.string().optional().nullable(),
  appPath: z.string().optional().nullable(),
  deployMode: z.string().optional().nullable(),
  processManager: z.string().optional().nullable(),
  runtimeServices: z.string().optional().nullable(),
  deployCommand: z.string().optional().nullable(),
  restartCommand: z.string().optional().nullable(),
  logCommand: z.string().optional().nullable(),
  healthCheckUrl: z.string().url().optional().nullable(),
  internalApiUrl: z.string().url().optional().nullable(),
  internalApiHealthUrl: z.string().url().optional().nullable(),
  internalApiHealthzUrl: z.string().url().optional().nullable(),
  dockerfileStatus: z.string().optional().nullable(),
  composeUsage: z.string().optional().nullable(),
  isActive: z.boolean(),
});

export const taskSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  linkedProjectId: z.string().optional().nullable(),
  title: z.string().min(2),
  description: nullableString,
  status: z.enum(["inbox", "ready", "in_progress", "review", "blocked", "done"]),
  executionMode: z.enum(["manual", "github_issue", "github_pr", "runtime_check", "deploy", "agent_prompt"]),
  executionStatus: z.enum(["queued", "in_progress", "blocked", "review", "done", "failed", "waiting_external"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assignedAgent: z.enum(["codex", "cursor", "claude", "human"]),
  githubIssueUrl: nullableString,
  githubPrUrl: nullableString,
  deployUrl: nullableString,
  branchName: nullableString,
  linkedGithubRepo: nullableString,
  linkedGithubIssueNumber: nullableNumber,
  linkedGithubPrNumber: nullableNumber,
  linkedGithubBranch: nullableString,
  linkedCommitSha: nullableString,
  blockedReason: nullableString,
  needsDecision: z.boolean(),
  nextStep: nullableString,
});

export const decisionSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  title: z.string().min(2),
  description: z.string().min(4),
  status: z.enum(["open", "resolved"]),
  resolution: z.string().optional().nullable(),
});
