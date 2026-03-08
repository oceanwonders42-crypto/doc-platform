-- Document: add routingStatus for needs_review / routed
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "routingStatus" TEXT;

-- RoutingRule: add updatedAt and minAutoRouteConfidence (replace minConfidence)
ALTER TABLE "RoutingRule" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RoutingRule" ADD COLUMN IF NOT EXISTS "minAutoRouteConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9;

-- Backfill minAutoRouteConfidence from minConfidence if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'RoutingRule' AND column_name = 'minConfidence') THEN
    UPDATE "RoutingRule" SET "minAutoRouteConfidence" = "minConfidence";
    ALTER TABLE "RoutingRule" DROP COLUMN "minConfidence";
  END IF;
END $$;
