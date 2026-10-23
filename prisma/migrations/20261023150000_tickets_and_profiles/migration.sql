-- DropForeignKey
ALTER TABLE "AccessCredential" DROP CONSTRAINT "AccessCredential_customerId_fkey";

-- AlterTable
ALTER TABLE "AccessCredential" ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "firstLoginAt" TIMESTAMP(3),
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "priceXaf" INTEGER,
ADD COLUMN     "startsOnFirstLogin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticketBatch" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "NetworkProfile" ADD COLUMN     "keepaliveTimeout" TEXT DEFAULT '3h',
ADD COLUMN     "statusAutorefresh" TEXT DEFAULT '1m',
ALTER COLUMN "idleTimeout" SET DEFAULT 'none';

-- CreateIndex
CREATE INDEX "AccessCredential_ticketBatch_idx" ON "AccessCredential"("ticketBatch");

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

