-- CreateTable (IF NOT EXISTS: Case may exist from earlier migration)
CREATE TABLE IF NOT EXISTS "Case" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "title" TEXT,
    "caseNumber" TEXT,
    "clientName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Case_firmId_idx" ON "Case"("firmId");
CREATE INDEX IF NOT EXISTS "Case_firmId_createdAt_idx" ON "Case"("firmId", "createdAt");

-- AddForeignKey (skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_firmId_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
