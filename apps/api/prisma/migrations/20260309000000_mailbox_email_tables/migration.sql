-- CreateTable: mailbox_connections (Email Intake v1)
CREATE TABLE IF NOT EXISTS "mailbox_connections" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'imap',
    "imap_host" TEXT,
    "imap_port" INTEGER,
    "imap_secure" BOOLEAN DEFAULT true,
    "imap_username" TEXT,
    "imap_password" TEXT,
    "folder" TEXT DEFAULT 'INBOX',
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_uid" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: email_messages
CREATE TABLE IF NOT EXISTS "email_messages" (
    "id" TEXT NOT NULL,
    "mailbox_connection_id" TEXT NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "from_email" TEXT,
    "subject" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: email_attachments
CREATE TABLE IF NOT EXISTS "email_attachments" (
    "id" TEXT NOT NULL,
    "email_message_id" TEXT NOT NULL,
    "filename" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "sha256" TEXT NOT NULL,
    "ingest_document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "mailbox_connections_firm_id_idx" ON "mailbox_connections"("firm_id");
CREATE INDEX IF NOT EXISTS "mailbox_connections_status_idx" ON "mailbox_connections"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "email_messages_mailbox_connection_id_provider_message_id_key" ON "email_messages"("mailbox_connection_id", "provider_message_id");
CREATE INDEX IF NOT EXISTS "email_messages_mailbox_connection_id_idx" ON "email_messages"("mailbox_connection_id");
CREATE UNIQUE INDEX IF NOT EXISTS "email_attachments_email_message_id_sha256_key" ON "email_attachments"("email_message_id", "sha256");
CREATE INDEX IF NOT EXISTS "email_attachments_email_message_id_idx" ON "email_attachments"("email_message_id");

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mailbox_connections_firm_id_fkey') THEN
    ALTER TABLE "mailbox_connections" ADD CONSTRAINT "mailbox_connections_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_messages_mailbox_connection_id_fkey') THEN
    ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_mailbox_connection_id_fkey" FOREIGN KEY ("mailbox_connection_id") REFERENCES "mailbox_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_attachments_email_message_id_fkey') THEN
    ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
