import type {
  AssignedAgent,
  AutomationJobStatus,
  DecisionStatus,
  TaskExecutionMode,
  TaskExecutionStatus,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";

import {
  agentLabels,
  agentTone,
  automationJobStatusLabels,
  automationJobStatusTone,
  decisionStatusLabels,
  executionModeLabels,
  executionModeTone,
  executionStatusLabels,
  executionStatusTone,
  githubSyncLabels,
  githubSyncTone,
  priorityLabels,
  priorityTone,
  runtimeStatusLabels,
  runtimeStatusTone,
  statusLabels,
  statusTone,
} from "@/lib/constants";

import { Badge } from "@/components/ui/badge";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge className={statusTone[status]}>{statusLabels[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge className={priorityTone[priority]}>{priorityLabels[priority]}</Badge>;
}

export function AgentBadge({ agent }: { agent: AssignedAgent }) {
  return <Badge className={agentTone[agent]}>{agentLabels[agent]}</Badge>;
}

export function ExecutionStatusBadge({ status }: { status: TaskExecutionStatus }) {
  return <Badge className={executionStatusTone[status]}>{executionStatusLabels[status]}</Badge>;
}

export function ExecutionModeBadge({ mode }: { mode: TaskExecutionMode }) {
  return <Badge className={executionModeTone[mode]}>{executionModeLabels[mode]}</Badge>;
}

export function DecisionStatusBadge({ status }: { status: DecisionStatus }) {
  return (
    <Badge
      className={
        status === "open"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }
    >
      {decisionStatusLabels[status]}
    </Badge>
  );
}

export function GitHubSyncBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "mock";

  return (
    <Badge className={githubSyncTone[value] ?? "border-slate-200 bg-slate-100 text-slate-700"}>
      {githubSyncLabels[value] ?? value}
    </Badge>
  );
}

export function RuntimeStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "unknown";

  return (
    <Badge className={runtimeStatusTone[value] ?? runtimeStatusTone.unknown}>
      {runtimeStatusLabels[value] ?? value}
    </Badge>
  );
}

export function AutomationJobStatusBadge({ status }: { status: AutomationJobStatus }) {
  return <Badge className={automationJobStatusTone[status]}>{automationJobStatusLabels[status]}</Badge>;
}
