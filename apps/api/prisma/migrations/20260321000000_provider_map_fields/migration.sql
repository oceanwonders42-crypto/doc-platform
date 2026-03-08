-- Provider map: lat, lng, primary specialty
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "specialty" TEXT;

CREATE INDEX IF NOT EXISTS "Provider_lat_lng_idx" ON "Provider"("lat", "lng");
CREATE INDEX IF NOT EXISTS "Provider_city_state_idx" ON "Provider"("city", "state");
CREATE INDEX IF NOT EXISTS "Provider_specialty_idx" ON "Provider"("specialty");
