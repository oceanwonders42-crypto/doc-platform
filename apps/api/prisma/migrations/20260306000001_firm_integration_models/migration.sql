-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('EMAIL', 'CASE_API');
CREATE TYPE "IntegrationProvider" AS ENUM ('GMAIL', 'OUTLOOK', 'CLIO', 'FILEVINE', 'GENERIC');
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'ERROR', 'DISCONNECTED');
CREATE TYPE "MailboxProvider" AS ENUM ('GMAIL', 'OUTLOOK', 'IMAP');

-- CreateTable
CREATE TABLE "FirmIntegration" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmIntegration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FirmIntegration_firmId_idx" ON "FirmIntegration"("firmId");
CREATE INDEX "FirmIntegration_firmId_type_idx" ON "FirmIntegration"("firmId", "type");
CREATE INDEX "FirmIntegration_status_idx" ON "FirmIntegration"("status");

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationCredential_integrationId_idx" ON "IntegrationCredential"("integrationId");

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "provider" "MailboxProvider" NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastUid" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "integrationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailboxConnection_firmId_idx" ON "MailboxConnection"("firmId");
CREATE INDEX "MailboxConnection_firmId_active_idx" ON "MailboxConnection"("firmId", "active");
CREATE INDEX "MailboxConnection_integrationId_idx" ON "MailboxConnection"("integrationId");
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FirmIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "IntegrationSyncLog" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationSyncLog_firmId_idx" ON "IntegrationSyncLog"("firmId");
CREATE INDEX "IntegrationSyncLog_integrationId_idx" ON "IntegrationSyncLog"("integrationId");
CREATE INDEX "IntegrationSyncLog_createdAt_idx" ON "IntegrationSyncLog"("createdAt");

-- CreateTable
CREATE TABLE "FieldMapping" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldMapping_firmId_idx" ON "FieldMapping"("firmId");
CREATE INDEX "FieldMapping_integrationId_idx" ON "FieldMapping"("integrationId");

-- AddForeignKey
ALTER TABLE "FirmIntegration" ADD CONSTRAINT "FirmIntegration_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FirmIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSyncLog" ADD CONSTRAINT "IntegrationSyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FirmIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FieldMapping" ADD CONSTRAINT "FieldMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FirmIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
