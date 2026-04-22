-- Add SCANNED, CLASSIFIED, ROUTED to DocumentStatus (Queue 1 pipeline statuses)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SCANNED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentStatus')) THEN
    ALTER TYPE "DocumentStatus" ADD VALUE 'SCANNED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CLASSIFIED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentStatus')) THEN
    ALTER TYPE "DocumentStatus" ADD VALUE 'CLASSIFIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ROUTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentStatus')) THEN
    ALTER TYPE "DocumentStatus" ADD VALUE 'ROUTED';
  END IF;
END $$;
