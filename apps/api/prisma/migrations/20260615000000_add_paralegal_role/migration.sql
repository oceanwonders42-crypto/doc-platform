-- Add PARALEGAL to Role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'PARALEGAL'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'PARALEGAL';
  END IF;
END $$;
