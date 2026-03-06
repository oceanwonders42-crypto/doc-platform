-- Add UNMATCHED to DocumentStatus enum (idempotent: skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'UNMATCHED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentStatus')
  ) THEN
    ALTER TYPE "DocumentStatus" ADD VALUE 'UNMATCHED';
  END IF;
END $$;
