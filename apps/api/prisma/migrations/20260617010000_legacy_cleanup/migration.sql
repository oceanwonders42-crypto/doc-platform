ALTER TABLE "RecordsRequest"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

WITH normalized_requests AS (
  SELECT
    id,
    CASE
      WHEN status IS NULL OR BTRIM(status) = '' THEN 'DRAFT'
      WHEN UPPER(BTRIM(status)) IN ('DRAFT', 'SENT', 'FOLLOW_UP_DUE', 'RECEIVED', 'COMPLETED', 'FAILED', 'CANCELLED')
        THEN UPPER(BTRIM(status))
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'draft' THEN 'DRAFT'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'sent' THEN 'SENT'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'follow_up_due' THEN 'FOLLOW_UP_DUE'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'received' THEN 'RECEIVED'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'completed' THEN 'COMPLETED'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'failed' THEN 'FAILED'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) IN ('cancelled', 'canceled') THEN 'CANCELLED'
      ELSE status
    END AS normalized_status
  FROM "RecordsRequest"
)
UPDATE "RecordsRequest" req
SET "status" = normalized_requests.normalized_status
FROM normalized_requests
WHERE req.id = normalized_requests.id
  AND req."status" IS DISTINCT FROM normalized_requests.normalized_status;

WITH normalized_events AS (
  SELECT
    id,
    CASE
      WHEN status IS NULL OR BTRIM(status) = '' THEN NULL
      WHEN UPPER(BTRIM(status)) IN ('DRAFT', 'SENT', 'FOLLOW_UP_DUE', 'RECEIVED', 'COMPLETED', 'FAILED', 'CANCELLED')
        THEN UPPER(BTRIM(status))
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'draft' THEN 'DRAFT'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'sent' THEN 'SENT'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'follow_up_due' THEN 'FOLLOW_UP_DUE'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'received' THEN 'RECEIVED'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'completed' THEN 'COMPLETED'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) = 'failed' THEN 'FAILED'
      WHEN LOWER(REGEXP_REPLACE(BTRIM(status), '[[:space:]-]+', '_', 'g')) IN ('cancelled', 'canceled') THEN 'CANCELLED'
      ELSE status
    END AS normalized_status
  FROM "RecordsRequestEvent"
)
UPDATE "RecordsRequestEvent" event
SET "status" = normalized_events.normalized_status
FROM normalized_events
WHERE event.id = normalized_events.id
  AND event."status" IS DISTINCT FROM normalized_events.normalized_status;

WITH legacy_case_names AS (
  SELECT DISTINCT
    c."firmId",
    BTRIM(c."clientName") AS full_name
  FROM "Case" c
  WHERE c."clientContactId" IS NULL
    AND c."clientName" IS NOT NULL
    AND BTRIM(c."clientName") <> ''
),
missing_contacts AS (
  SELECT
    legacy_case_names."firmId",
    legacy_case_names.full_name
  FROM legacy_case_names
  LEFT JOIN "Contact" contact
    ON contact."firmId" = legacy_case_names."firmId"
   AND LOWER(BTRIM(contact."fullName")) = LOWER(legacy_case_names.full_name)
  WHERE contact.id IS NULL
)
INSERT INTO "Contact" (
  id,
  "firmId",
  "firstName",
  "lastName",
  "fullName",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-contact-' || md5(missing_contacts."firmId" || ':' || missing_contacts.full_name),
  missing_contacts."firmId",
  CASE
    WHEN POSITION(' ' IN missing_contacts.full_name) > 0 THEN SPLIT_PART(missing_contacts.full_name, ' ', 1)
    ELSE NULL
  END,
  CASE
    WHEN POSITION(' ' IN missing_contacts.full_name) > 0
      THEN NULLIF(BTRIM(SUBSTRING(missing_contacts.full_name FROM POSITION(' ' IN missing_contacts.full_name) + 1)), '')
    ELSE missing_contacts.full_name
  END,
  missing_contacts.full_name,
  NOW(),
  NOW()
FROM missing_contacts
ON CONFLICT (id) DO NOTHING;

UPDATE "Case" c
SET
  "clientContactId" = contact.id,
  "clientName" = contact."fullName",
  "updatedAt" = NOW()
FROM "Contact" contact
WHERE c."clientContactId" IS NULL
  AND c."firmId" = contact."firmId"
  AND c."clientName" IS NOT NULL
  AND BTRIM(c."clientName") <> ''
  AND LOWER(BTRIM(c."clientName")) = LOWER(BTRIM(contact."fullName"));
