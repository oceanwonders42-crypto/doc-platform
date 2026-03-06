-- Add track and metadataJson to CaseTimelineEvent for legal/insurance timeline tracks
ALTER TABLE "CaseTimelineEvent" ADD COLUMN IF NOT EXISTS "track" TEXT NOT NULL DEFAULT 'medical';
ALTER TABLE "CaseTimelineEvent" ADD COLUMN IF NOT EXISTS "metadataJson" JSONB;

CREATE INDEX IF NOT EXISTS "CaseTimelineEvent_caseId_firmId_track_idx" ON "CaseTimelineEvent"("caseId", "firmId", "track");
