-- Provider monetization: verified, subscriptionTier, listingActive, expiresAt
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Provider' AND column_name = 'verified') THEN
    ALTER TABLE "Provider" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Provider' AND column_name = 'subscriptionTier') THEN
    ALTER TABLE "Provider" ADD COLUMN "subscriptionTier" TEXT NOT NULL DEFAULT 'free';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Provider' AND column_name = 'listingActive') THEN
    ALTER TABLE "Provider" ADD COLUMN "listingActive" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Provider' AND column_name = 'expiresAt') THEN
    ALTER TABLE "Provider" ADD COLUMN "expiresAt" TIMESTAMP(3);
  END IF;
END $$;
