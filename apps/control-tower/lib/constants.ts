import type {
  AssignedAgent,
  AutomationAction,
  AutomationJobStatus,
  DecisionStatus,
  DeployType,
  Environment,
  TaskExecutionMode,
  TaskExecutionStatus,
  TaskPriority,
  TaskStatus,
  TaskPromptTarget,
} from "@prisma/client";

export const statusOptions: TaskStatus[] = [
  "inbox",
  "ready",
  "in_progress",
  "review",
  "blocked",
  "done",
];

export const priorityOptions: TaskPriority[] = ["low", "medium", "high", "urgent"];
export const agentOptions: AssignedAgent[] = ["codex", "cursor", "claude", "human"];
export const executionModeOptions: TaskExecutionMode[] = [
  "manual",
  "github_issue",
  "github_pr",
  "runtime_check",
  "deploy",
  "agent_prompt",
];
export const executionStatusOptions: TaskExecutionStatus[] = [
  "queued",
  "in_progress",
  "blocked",
  "review",
  "done",
  "failed",
  "waiting_external",
];
export const decisionStatusOptions: DecisionStatus[] = ["open", "resolved"];
export const deployTypeOptions: DeployType[] = ["droplet", "app_platform", "other"];
export const environmentOptions: Environment[] = ["prod", "staging", "dev"];
export const promptTargetOptions: TaskPromptTarget[] = ["codex", "cursor", "claude"];
export const automationActionOptions: AutomationAction[] = [
  "github_sync",
  "runtime_refresh",
  "task_status_reconcile",
  "project_health_reconcile",
  "generate_agent_prompt",
];

export const statusLabels: Record<TaskStatus, string> = {
  inbox: "Inbox",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const agentLabels: Record<AssignedAgent, string> = {
  codex: "Codex",
  cursor: "Cursor",
  claude: "Claude",
  human: "Human",
};

export const executionModeLabels: Record<TaskExecutionMode, string> = {
  manual: "Manual",
  github_issue: "GitHub Issue",
  github_pr: "GitHub PR",
  runtime_check: "Runtime Check",
  deploy: "Deploy",
  agent_prompt: "Agent Prompt",
};

export const executionStatusLabels: Record<TaskExecutionStatus, string> = {
  queued: "Queued",
  in_progress: "Running",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  failed: "Failed",
  waiting_external: "Waiting External",
};

export const promptTargetLabels: Record<TaskPromptTarget, string> = {
  codex: "Codex",
  cursor: "Cursor",
  claude: "Claude",
};

export const automationActionLabels: Record<AutomationAction, string> = {
  github_sync: "GitHub Sync",
  runtime_refresh: "Runtime Refresh",
  task_status_reconcile: "Task Reconcile",
  project_health_reconcile: "Project Health",
  generate_agent_prompt: "Generate Prompt",
};

export const automationJobStatusLabels: Record<AutomationJobStatus, string> = {
  queued: "Queued",
  in_progress: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
};

export const decisionStatusLabels: Record<DecisionStatus, string> = {
  open: "Open",
  resolved: "Resolved",
};

export const deployTypeLabels: Record<DeployType, string> = {
  droplet: "Droplet",
  app_platform: "App Platform",
  other: "Other",
};

export const environmentLabels: Record<Environment, string> = {
  prod: "Prod",
  staging: "Staging",
  dev: "Dev",
};

export const statusTone: Record<TaskStatus, string> = {
  inbox: "border-slate-200 bg-slate-100 text-slate-700",
  ready: "border-blue-200 bg-blue-50 text-blue-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  review: "border-violet-200 bg-violet-50 text-violet-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export const priorityTone: Record<TaskPriority, string> = {
  low: "border-slate-200 bg-slate-100 text-slate-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  urgent: "border-rose-200 bg-rose-50 text-rose-700",
};

export const agentTone: Record<AssignedAgent, string> = {
  codex: "border-blue-200 bg-blue-50 text-blue-700",
  cursor: "border-emerald-200 bg-emerald-50 text-emerald-700",
  claude: "border-indigo-200 bg-indigo-50 text-indigo-700",
  human: "border-slate-200 bg-slate-100 text-slate-700",
};

export const executionStatusTone: Record<TaskExecutionStatus, string> = {
  queued: "border-slate-200 bg-slate-100 text-slate-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  blocked: "border-amber-200 bg-amber-50 text-amber-800",
  review: "border-violet-200 bg-violet-50 text-violet-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  waiting_external: "border-cyan-200 bg-cyan-50 text-cyan-700",
};

export const executionModeTone: Record<TaskExecutionMode, string> = {
  manual: "border-slate-200 bg-slate-100 text-slate-700",
  github_issue: "border-blue-200 bg-blue-50 text-blue-700",
  github_pr: "border-indigo-200 bg-indigo-50 text-indigo-700",
  runtime_check: "border-amber-200 bg-amber-50 text-amber-700",
  deploy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  agent_prompt: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
};

export const automationJobStatusTone: Record<AutomationJobStatus, string> = {
  queued: "border-slate-200 bg-slate-100 text-slate-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

export const githubSyncLabels: Record<string, string> = {
  success: "Synced",
  partial: "Partial",
  error: "Error",
  mock: "Mock",
  running: "Running",
};

export const githubSyncTone: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  mock: "border-blue-200 bg-blue-50 text-blue-700",
  running: "border-sky-200 bg-sky-50 text-sky-700",
};

export const runtimeStatusLabels: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  failed: "Failed",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
};

export const runtimeStatusTone: Record<string, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  degraded: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  unhealthy: "border-rose-200 bg-rose-50 text-rose-700",
  unknown: "border-slate-200 bg-slate-100 text-slate-700",
};
