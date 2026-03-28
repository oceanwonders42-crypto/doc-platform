import { PrismaClient } from "@prisma/client";

import { loadLocalEnv } from "./load-env.mjs";

loadLocalEnv();
const prisma = new PrismaClient();

const createStatements = [
  "PRAGMA foreign_keys = OFF;",
  `CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "repoUrl" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "deployType" TEXT NOT NULL,
    "deployTargetName" TEXT NOT NULL,
    "deployTargetIdOrHost" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "containerImage" TEXT,
    "containerRegistryUrl" TEXT,
    "publicUrl" TEXT,
    "sshHost" TEXT,
    "sshPort" INTEGER,
    "sshUser" TEXT,
    "appPath" TEXT,
    "deployMode" TEXT,
    "processManager" TEXT,
    "runtimeServices" TEXT,
    "apiServiceName" TEXT,
    "apiServiceId" INTEGER,
    "webServiceName" TEXT,
    "webServiceId" INTEGER,
    "deployCommand" TEXT,
    "restartCommand" TEXT,
    "logCommand" TEXT,
    "healthCheckUrl" TEXT,
    "internalApiUrl" TEXT,
    "internalApiHealthUrl" TEXT,
    "internalApiHealthzUrl" TEXT,
    "dockerfileStatus" TEXT,
    "composeUsage" TEXT,
    "apiHealthy" BOOLEAN,
    "webHealthy" BOOLEAN,
    "publicHealthy" BOOLEAN,
    "runtimeStatus" TEXT,
    "lastRuntimeCheckAt" DATETIME,
    "runtimeReason" TEXT,
    "runtimeDetails" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "githubRepoId" TEXT,
    "lastGithubSyncAt" DATETIME,
    "githubSyncStatus" TEXT,
    "githubSyncError" TEXT,
    "githubOpenIssueCount" INTEGER NOT NULL DEFAULT 0,
    "githubOpenPrCount" INTEGER NOT NULL DEFAULT 0,
    "githubLastActivityAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Project_slug_key" ON "Project"("slug");`,
  `CREATE INDEX IF NOT EXISTS "Project_isActive_idx" ON "Project"("isActive");`,
  `CREATE INDEX IF NOT EXISTS "Project_environment_idx" ON "Project"("environment");`,
  `CREATE INDEX IF NOT EXISTS "Project_githubRepoId_idx" ON "Project"("githubRepoId");`,
  `CREATE INDEX IF NOT EXISTS "Project_githubSyncStatus_idx" ON "Project"("githubSyncStatus");`,
  `CREATE INDEX IF NOT EXISTS "Project_runtimeStatus_idx" ON "Project"("runtimeStatus");`,
  `CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "linkedProjectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL DEFAULT 'manual',
    "executionStatus" TEXT NOT NULL DEFAULT 'queued',
    "priority" TEXT NOT NULL,
    "assignedAgent" TEXT NOT NULL,
    "githubIssueUrl" TEXT,
    "githubPrUrl" TEXT,
    "deployUrl" TEXT,
    "branchName" TEXT,
    "linkedGithubRepo" TEXT,
    "linkedGithubIssueNumber" INTEGER,
    "linkedGithubPrNumber" INTEGER,
    "linkedGithubBranch" TEXT,
    "linkedCommitSha" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "blockedReason" TEXT,
    "lastExternalUpdateAt" DATETIME,
    "needsDecision" BOOLEAN NOT NULL DEFAULT false,
    "nextStep" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "Task_projectId_idx" ON "Task"("projectId");`,
  `CREATE INDEX IF NOT EXISTS "Task_linkedProjectId_idx" ON "Task"("linkedProjectId");`,
  `CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");`,
  `CREATE INDEX IF NOT EXISTS "Task_executionMode_idx" ON "Task"("executionMode");`,
  `CREATE INDEX IF NOT EXISTS "Task_executionStatus_idx" ON "Task"("executionStatus");`,
  `CREATE INDEX IF NOT EXISTS "Task_assignedAgent_idx" ON "Task"("assignedAgent");`,
  `CREATE INDEX IF NOT EXISTS "Task_needsDecision_idx" ON "Task"("needsDecision");`,
  `CREATE INDEX IF NOT EXISTS "Task_linkedGithubRepo_idx" ON "Task"("linkedGithubRepo");`,
  `CREATE INDEX IF NOT EXISTS "Task_linkedGithubIssueNumber_idx" ON "Task"("linkedGithubIssueNumber");`,
  `CREATE INDEX IF NOT EXISTS "Task_linkedGithubPrNumber_idx" ON "Task"("linkedGithubPrNumber");`,
  `CREATE TABLE IF NOT EXISTS "DecisionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DecisionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "DecisionItem_status_idx" ON "DecisionItem"("status");`,
  `CREATE INDEX IF NOT EXISTS "DecisionItem_taskId_idx" ON "DecisionItem"("taskId");`,
  `CREATE INDEX IF NOT EXISTS "DecisionItem_projectId_idx" ON "DecisionItem"("projectId");`,
  `CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");`,
  `CREATE INDEX IF NOT EXISTS "ActivityLog_projectId_idx" ON "ActivityLog"("projectId");`,
  `CREATE INDEX IF NOT EXISTS "ActivityLog_taskId_idx" ON "ActivityLog"("taskId");`,
  `CREATE TABLE IF NOT EXISTS "TaskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fromExecutionStatus" TEXT,
    "toExecutionStatus" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "TaskEvent_projectId_createdAt_idx" ON "TaskEvent"("projectId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "TaskEvent_type_idx" ON "TaskEvent"("type");`,
  `CREATE TABLE IF NOT EXISTS "TaskPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetAgent" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "contextSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskPrompt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "TaskPrompt_taskId_createdAt_idx" ON "TaskPrompt"("taskId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "TaskPrompt_targetAgent_idx" ON "TaskPrompt"("targetAgent");`,
  `CREATE TABLE IF NOT EXISTS "AutomationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "projectId" TEXT,
    "taskId" TEXT,
    "promptTarget" TEXT,
    "requestedBy" TEXT,
    "scopeLabel" TEXT,
    "message" TEXT,
    "errorMessage" TEXT,
    "details" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationJob_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "AutomationJob_action_createdAt_idx" ON "AutomationJob"("action", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "AutomationJob_status_createdAt_idx" ON "AutomationJob"("status", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "AutomationJob_projectId_idx" ON "AutomationJob"("projectId");`,
  `CREATE INDEX IF NOT EXISTS "AutomationJob_taskId_idx" ON "AutomationJob"("taskId");`,
  `CREATE TABLE IF NOT EXISTS "GitHubRepoSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubRepoId" TEXT NOT NULL,
    "githubNodeId" TEXT,
    "ownerLogin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "htmlUrl" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "visibility" TEXT,
    "pushedAt" DATETIME,
    "repoUpdatedAt" DATETIME NOT NULL,
    "openIssueCount" INTEGER NOT NULL DEFAULT 0,
    "openPullRequestCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "GitHubRepoSnapshot_githubRepoId_key" ON "GitHubRepoSnapshot"("githubRepoId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "GitHubRepoSnapshot_fullName_key" ON "GitHubRepoSnapshot"("fullName");`,
  `CREATE INDEX IF NOT EXISTS "GitHubRepoSnapshot_ownerLogin_idx" ON "GitHubRepoSnapshot"("ownerLogin");`,
  `CREATE INDEX IF NOT EXISTS "GitHubRepoSnapshot_repoUpdatedAt_idx" ON "GitHubRepoSnapshot"("repoUpdatedAt");`,
  `CREATE INDEX IF NOT EXISTS "GitHubRepoSnapshot_lastSyncAt_idx" ON "GitHubRepoSnapshot"("lastSyncAt");`,
  `CREATE TABLE IF NOT EXISTS "GitHubIssueSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "githubIssueId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorLogin" TEXT,
    "issueUpdatedAt" DATETIME NOT NULL,
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GitHubIssueSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "GitHubIssueSnapshot_projectId_githubIssueId_key" ON "GitHubIssueSnapshot"("projectId", "githubIssueId");`,
  `CREATE INDEX IF NOT EXISTS "GitHubIssueSnapshot_projectId_idx" ON "GitHubIssueSnapshot"("projectId");`,
  `CREATE INDEX IF NOT EXISTS "GitHubIssueSnapshot_issueUpdatedAt_idx" ON "GitHubIssueSnapshot"("issueUpdatedAt");`,
  `CREATE TABLE IF NOT EXISTS "GitHubPullRequestSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "githubPullRequestId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorLogin" TEXT,
    "headRefName" TEXT,
    "pullRequestUpdatedAt" DATETIME NOT NULL,
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GitHubPullRequestSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "GitHubPullRequestSnapshot_projectId_githubPullRequestId_key" ON "GitHubPullRequestSnapshot"("projectId", "githubPullRequestId");`,
  `CREATE INDEX IF NOT EXISTS "GitHubPullRequestSnapshot_projectId_idx" ON "GitHubPullRequestSnapshot"("projectId");`,
  `CREATE INDEX IF NOT EXISTS "GitHubPullRequestSnapshot_pullRequestUpdatedAt_idx" ON "GitHubPullRequestSnapshot"("pullRequestUpdatedAt");`,
  `CREATE TABLE IF NOT EXISTS "IntegrationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "owner" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT,
    "lastSyncAt" DATETIME,
    "lastSyncMessage" TEXT,
    "lastSyncError" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationState_provider_key" ON "IntegrationState"("provider");`,
];

const alterStatements = [
  `ALTER TABLE "Project" ADD COLUMN "githubRepoId" TEXT;`,
  `ALTER TABLE "Project" ADD COLUMN "lastGithubSyncAt" DATETIME;`,
  `ALTER TABLE "Project" ADD COLUMN "githubSyncStatus" TEXT;`,
  `ALTER TABLE "Project" ADD COLUMN "githubSyncError" TEXT;`,
  `ALTER TABLE "Project" ADD COLUMN "githubOpenIssueCount" INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE "Project" ADD COLUMN "githubOpenPrCount" INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE "Project" ADD COLUMN "githubLastActivityAt" DATETIME;`,
  `ALTER TABLE "Task" ADD COLUMN "linkedProjectId" TEXT;`,
  `ALTER TABLE "Task" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'manual';`,
  `ALTER TABLE "Task" ADD COLUMN "executionStatus" TEXT NOT NULL DEFAULT 'queued';`,
  `ALTER TABLE "Task" ADD COLUMN "linkedGithubRepo" TEXT;`,
  `ALTER TABLE "Task" ADD COLUMN "linkedGithubIssueNumber" INTEGER;`,
  `ALTER TABLE "Task" ADD COLUMN "linkedGithubPrNumber" INTEGER;`,
  `ALTER TABLE "Task" ADD COLUMN "linkedGithubBranch" TEXT;`,
  `ALTER TABLE "Task" ADD COLUMN "linkedCommitSha" TEXT;`,
  `ALTER TABLE "Task" ADD COLUMN "startedAt" DATETIME;`,
  `ALTER TABLE "Task" ADD COLUMN "completedAt" DATETIME;`,
  `ALTER TABLE "Task" ADD COLUMN "failedAt" DATETIME;`,
  `ALTER TABLE "Task" ADD COLUMN "lastExternalUpdateAt" DATETIME;`,
  `UPDATE "Task" SET "assignedAgent" = 'human' WHERE "assignedAgent" = 'me';`,
];

async function execute(statement, ignoreErrorPattern) {
  try {
    await prisma.$executeRawUnsafe(statement);
  } catch (error) {
    if (ignoreErrorPattern && error instanceof Error && ignoreErrorPattern.test(error.message)) {
      return;
    }

    throw error;
  }
}

try {
  for (const statement of createStatements) {
    await prisma.$executeRawUnsafe(statement);
  }

  for (const statement of alterStatements) {
    await execute(statement, /duplicate column name|already exists/i);
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
  console.log("Database schema ensured.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
