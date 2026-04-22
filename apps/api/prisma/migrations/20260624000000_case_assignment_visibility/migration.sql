ALTER TABLE "Case"
  ADD COLUMN "assignedUserId" TEXT,
  ADD COLUMN "clioResponsibleAttorneyId" TEXT,
  ADD COLUMN "clioResponsibleAttorneyEmail" TEXT,
  ADD COLUMN "clioAssignmentSyncedAt" TIMESTAMP(3);

ALTER TABLE "Case"
  ADD CONSTRAINT "Case_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "Case_firmId_assignedUserId_idx" ON "Case"("firmId", "assignedUserId");
CREATE INDEX "Case_firmId_clioResponsibleAttorneyEmail_idx" ON "Case"("firmId", "clioResponsibleAttorneyEmail");
