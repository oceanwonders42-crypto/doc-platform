-- Tenant isolation: compound indexes for firm-scoped queries
-- Run after 20260306000001_firm_integration_models
-- Note: Case table is created in 20260317000000_case_model; index created there or conditionally here

-- Document: common filters by firm
CREATE INDEX IF NOT EXISTS "Document_firmId_createdAt_idx" ON "Document"("firmId", "createdAt");
CREATE INDEX IF NOT EXISTS "Document_firmId_status_idx" ON "Document"("firmId", "status");
CREATE INDEX IF NOT EXISTS "Document_firmId_routedCaseId_idx" ON "Document"("firmId", "routedCaseId");

-- Case: list by firm and time (Case table created in later migration 20260317000000)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Case') THEN
    CREATE INDEX IF NOT EXISTS "Case_firmId_createdAt_idx" ON "Case"("firmId", "createdAt");
  END IF;
END $$;

-- DocumentAuditEvent: firm + time (table created in 20260334000000_repair_case_and_audit)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'DocumentAuditEvent') THEN
    CREATE INDEX IF NOT EXISTS "DocumentAuditEvent_firmId_createdAt_idx" ON "DocumentAuditEvent"("firmId", "createdAt");
  END IF;
END $$;

-- MailboxConnection: firm + lastSyncAt for health dashboards
CREATE INDEX IF NOT EXISTS "MailboxConnection_firmId_lastSyncAt_idx" ON "MailboxConnection"("firmId", "lastSyncAt");
