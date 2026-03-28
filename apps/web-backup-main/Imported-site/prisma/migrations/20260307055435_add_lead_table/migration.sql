-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firm" TEXT NOT NULL,
    "cms" TEXT,
    "firmSize" TEXT,
    "message" TEXT,
    "source" TEXT DEFAULT 'demo'
);
