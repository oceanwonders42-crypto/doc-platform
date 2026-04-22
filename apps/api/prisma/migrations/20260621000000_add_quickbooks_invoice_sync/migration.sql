ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'QUICKBOOKS';

CREATE TYPE "QuickbooksInvoiceStatus" AS ENUM ('PENDING', 'INVOICE_CREATED', 'EMAILED', 'FAILED');

CREATE TABLE "QuickbooksInvoiceSync" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "integrationId" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "sourceOrderNumber" TEXT NOT NULL,
    "billingEmail" TEXT,
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "sanitizedPayload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "qboCustomerId" TEXT,
    "qboInvoiceId" TEXT,
    "qboInvoiceDocNumber" TEXT,
    "invoiceStatus" "QuickbooksInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceEmailedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickbooksInvoiceSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickbooksInvoiceSync_firmId_sourceSystem_sourceOrderId_key"
ON "QuickbooksInvoiceSync"("firmId", "sourceSystem", "sourceOrderId");

CREATE UNIQUE INDEX "QuickbooksInvoiceSync_firmId_dedupeKey_key"
ON "QuickbooksInvoiceSync"("firmId", "dedupeKey");

CREATE INDEX "QuickbooksInvoiceSync_firmId_createdAt_idx"
ON "QuickbooksInvoiceSync"("firmId", "createdAt");

CREATE INDEX "QuickbooksInvoiceSync_firmId_invoiceStatus_createdAt_idx"
ON "QuickbooksInvoiceSync"("firmId", "invoiceStatus", "createdAt");

CREATE INDEX "QuickbooksInvoiceSync_firmId_billingEmail_idx"
ON "QuickbooksInvoiceSync"("firmId", "billingEmail");

CREATE INDEX "QuickbooksInvoiceSync_integrationId_idx"
ON "QuickbooksInvoiceSync"("integrationId");

ALTER TABLE "QuickbooksInvoiceSync"
ADD CONSTRAINT "QuickbooksInvoiceSync_firmId_fkey"
FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuickbooksInvoiceSync"
ADD CONSTRAINT "QuickbooksInvoiceSync_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "FirmIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
