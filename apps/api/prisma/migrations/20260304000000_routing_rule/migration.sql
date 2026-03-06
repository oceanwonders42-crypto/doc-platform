-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "autoRouteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoutingRule_firmId_key" ON "RoutingRule"("firmId");

-- AddForeignKey
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
