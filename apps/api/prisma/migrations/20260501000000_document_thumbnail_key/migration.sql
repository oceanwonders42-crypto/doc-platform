-- Document preview thumbnails: store S3/Spaces key for first-page PNG
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "thumbnailKey" TEXT;
