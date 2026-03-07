-- Tenant isolation: compound indexes for firm-scoped queries
-- Run after 20260306000001_firm_integration_models

-- Document: common filters by firm
CREATE INDEX IF NOT EXISTS "Document_firmId_createdAt_idx" ON "Document"("firmId", "createdAt");
CREATE INDEX IF NOT EXISTS "Document_firmId_status_idx" ON "Document"("firmId", "status");
CREATE INDEX IF NOT EXISTS "Document_firmId_routedCaseId_idx" ON "Document"("firmId", "routedCaseId");

-- Case: list by firm and time
CREATE INDEX IF NOT EXISTS "Case_firmId_createdAt_idx" ON "Case"("firmId", "createdAt");

-- DocumentAuditEvent: firm + time
CREATE INDEX IF NOT EXISTS "DocumentAuditEvent_firmId_createdAt_idx" ON "DocumentAuditEvent"("firmId", "createdAt");

-- MailboxConnection: firm + lastSyncAt for health dashboards
CREATE INDEX IF NOT EXISTS "MailboxConnection_firmId_lastSyncAt_idx" ON "MailboxConnection"("firmId", "lastSyncAt");
