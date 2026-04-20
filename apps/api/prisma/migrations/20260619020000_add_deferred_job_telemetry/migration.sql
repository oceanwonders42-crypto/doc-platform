create table if not exists "DeferredJobTelemetry" (
  "id" text primary key,
  "firmId" text,
  "documentId" text,
  "caseId" text,
  "jobType" text not null,
  "action" text,
  "dedupeKey" text,
  "workerLabel" text,
  "queuedAt" timestamp(3) not null,
  "startedAt" timestamp(3) not null,
  "finishedAt" timestamp(3) not null,
  "waitMs" integer not null,
  "runMs" integer not null,
  "attempt" integer not null default 1,
  "success" boolean not null,
  "errorMessage" text,
  "meta" jsonb,
  "createdAt" timestamp(3) not null default current_timestamp
);

create index if not exists "DeferredJobTelemetry_createdAt_idx"
  on "DeferredJobTelemetry"("createdAt");

create index if not exists "DeferredJobTelemetry_jobType_createdAt_idx"
  on "DeferredJobTelemetry"("jobType", "createdAt");

create index if not exists "DeferredJobTelemetry_jobType_success_createdAt_idx"
  on "DeferredJobTelemetry"("jobType", "success", "createdAt");

create index if not exists "DeferredJobTelemetry_firmId_createdAt_idx"
  on "DeferredJobTelemetry"("firmId", "createdAt");

create index if not exists "DeferredJobTelemetry_documentId_createdAt_idx"
  on "DeferredJobTelemetry"("documentId", "createdAt");

create index if not exists "DeferredJobTelemetry_caseId_createdAt_idx"
  on "DeferredJobTelemetry"("caseId", "createdAt");

create index if not exists "DeferredJobTelemetry_jobType_queuedAt_idx"
  on "DeferredJobTelemetry"("jobType", "queuedAt");
