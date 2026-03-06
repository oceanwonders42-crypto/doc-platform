-- Add billing fields to Firm
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Firm' AND column_name = 'billingCustomerId') THEN
    ALTER TABLE "Firm" ADD COLUMN "billingCustomerId" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Firm' AND column_name = 'billingStatus') THEN
    ALTER TABLE "Firm" ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'trial';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Firm' AND column_name = 'trialEndsAt') THEN
    ALTER TABLE "Firm" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
  END IF;
END $$;
