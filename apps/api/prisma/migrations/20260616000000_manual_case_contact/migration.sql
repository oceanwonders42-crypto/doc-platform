CREATE TABLE IF NOT EXISTS "Contact" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Contact_firmId_idx" ON "Contact"("firmId");
CREATE INDEX IF NOT EXISTS "Contact_firmId_fullName_idx" ON "Contact"("firmId", "fullName");
CREATE INDEX IF NOT EXISTS "Contact_firmId_email_idx" ON "Contact"("firmId", "email");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Contact_firmId_fkey'
  ) THEN
    ALTER TABLE "Contact"
      ADD CONSTRAINT "Contact_firmId_fkey"
      FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "clientContactId" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "incidentDate" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE INDEX IF NOT EXISTS "Case_clientContactId_idx" ON "Case"("clientContactId");
CREATE INDEX IF NOT EXISTS "Case_firmId_status_idx" ON "Case"("firmId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Case_clientContactId_fkey'
  ) THEN
    ALTER TABLE "Case"
      ADD CONSTRAINT "Case_clientContactId_fkey"
      FOREIGN KEY ("clientContactId") REFERENCES "Contact"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
