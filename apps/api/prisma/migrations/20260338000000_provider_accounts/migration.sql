-- CreateTable: ProviderAccount
CREATE TABLE IF NOT EXISTS "ProviderAccount" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PROVIDER_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProviderInvite
CREATE TABLE IF NOT EXISTS "ProviderInvite" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderAccount_email_key" ON "ProviderAccount"("email");
CREATE INDEX IF NOT EXISTS "ProviderAccount_providerId_idx" ON "ProviderAccount"("providerId");
CREATE INDEX IF NOT EXISTS "ProviderInvite_providerId_idx" ON "ProviderInvite"("providerId");
CREATE INDEX IF NOT EXISTS "ProviderInvite_email_idx" ON "ProviderInvite"("email");

ALTER TABLE "ProviderAccount" ADD CONSTRAINT "ProviderAccount_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderInvite" ADD CONSTRAINT "ProviderInvite_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
