-- Queue 3: Medical bill line items for billing extraction
CREATE TABLE IF NOT EXISTS "MedicalBillLineItem" (
  id TEXT PRIMARY KEY,
  "firmId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "providerName" TEXT,
  "serviceDate" TIMESTAMPTZ,
  "cptCode" TEXT,
  "procedureDescription" TEXT,
  "amountCharged" NUMERIC,
  "amountPaid" NUMERIC,
  "balance" NUMERIC,
  "lineTotal" NUMERIC,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medical_bill_line_item_case ON "MedicalBillLineItem" ("caseId");
CREATE INDEX IF NOT EXISTS idx_medical_bill_line_item_document ON "MedicalBillLineItem" ("documentId");
CREATE INDEX IF NOT EXISTS idx_medical_bill_line_item_firm ON "MedicalBillLineItem" ("firmId");
