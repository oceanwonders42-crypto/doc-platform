-- Provider: hoursJson, serviceAreasJson, intakeInstructions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Provider' AND column_name = 'hoursJson') THEN
    ALTER TABLE "Provider" ADD COLUMN "hoursJson" JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Provider' AND column_name = 'serviceAreasJson') THEN
    ALTER TABLE "Provider" ADD COLUMN "serviceAreasJson" JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Provider' AND column_name = 'intakeInstructions') THEN
    ALTER TABLE "Provider" ADD COLUMN "intakeInstructions" TEXT;
  END IF;
END $$;
