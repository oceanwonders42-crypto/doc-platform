-- Add firm settings (e.g. crm: "clio", clioAccessToken)
ALTER TABLE "Firm" ADD COLUMN IF NOT EXISTS "settings" JSONB;
