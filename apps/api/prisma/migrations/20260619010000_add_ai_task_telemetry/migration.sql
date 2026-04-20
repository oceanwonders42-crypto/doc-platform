create table if not exists "AiTaskTelemetry" (
  "id" text primary key,
  "firmId" text,
  "documentId" text,
  "caseId" text,
  "taskType" text not null,
  "taskVariant" text,
  "source" text,
  "kind" text not null default 'executed',
  "model" text,
  "promptVersion" text,
  "inputHash" text,
  "promptTokens" integer,
  "completionTokens" integer,
  "totalTokens" integer,
  "estimatedCostUsd" double precision,
  "cacheUsed" boolean not null default false,
  "dedupeAvoided" boolean not null default false,
  "errorMessage" text,
  "meta" jsonb,
  "createdAt" timestamp(3) not null default current_timestamp
);

create index if not exists "AiTaskTelemetry_createdAt_idx"
  on "AiTaskTelemetry"("createdAt");

create index if not exists "AiTaskTelemetry_kind_createdAt_idx"
  on "AiTaskTelemetry"("kind", "createdAt");

create index if not exists "AiTaskTelemetry_taskType_createdAt_idx"
  on "AiTaskTelemetry"("taskType", "createdAt");

create index if not exists "AiTaskTelemetry_taskType_kind_createdAt_idx"
  on "AiTaskTelemetry"("taskType", "kind", "createdAt");

create index if not exists "AiTaskTelemetry_firmId_createdAt_idx"
  on "AiTaskTelemetry"("firmId", "createdAt");

create index if not exists "AiTaskTelemetry_documentId_createdAt_idx"
  on "AiTaskTelemetry"("documentId", "createdAt");

create index if not exists "AiTaskTelemetry_caseId_createdAt_idx"
  on "AiTaskTelemetry"("caseId", "createdAt");

create index if not exists "AiTaskTelemetry_documentId_taskType_kind_createdAt_idx"
  on "AiTaskTelemetry"("documentId", "taskType", "kind", "createdAt");

create index if not exists "AiTaskTelemetry_documentId_taskType_inputHash_promptVersion_model_createdAt_idx"
  on "AiTaskTelemetry"("documentId", "taskType", "inputHash", "promptVersion", "model", "createdAt");
