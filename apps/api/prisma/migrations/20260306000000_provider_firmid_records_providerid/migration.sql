-- Provider: add firmId (required, scoped per firm)
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "firmId" TEXT;

UPDATE "Provider" SET "firmId" = (SELECT id FROM "Firm" LIMIT 1) WHERE "firmId" IS NULL;

ALTER TABLE "Provider" ALTER COLUMN "firmId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Provider_firmId_idx" ON "Provider"("firmId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Provider_firmId_fkey') THEN
    ALTER TABLE "Provider" ADD CONSTRAINT "Provider_firmId_fkey"
      FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- RecordsRequest: add providerId (optional), make providerContact nullable
ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "providerId" TEXT;

ALTER TABLE "RecordsRequest" ALTER COLUMN "providerContact" DROP NOT NULL;
