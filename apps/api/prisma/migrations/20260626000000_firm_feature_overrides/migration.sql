CREATE TABLE "firm_feature_overrides" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "firm_feature_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "firm_feature_overrides_firmId_featureKey_isActive_idx"
  ON "firm_feature_overrides"("firmId", "featureKey", "isActive");

CREATE INDEX "firm_feature_overrides_firmId_isActive_startsAt_endsAt_idx"
  ON "firm_feature_overrides"("firmId", "isActive", "startsAt", "endsAt");

ALTER TABLE "firm_feature_overrides"
  ADD CONSTRAINT "firm_feature_overrides_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
