-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('UNUSED', 'REDEEMED', 'VOID');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "voucherId" TEXT;

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeHint" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'UNUSED',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "redeemedById" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_codeHash_key" ON "Voucher"("codeHash");

-- CreateIndex
CREATE INDEX "Voucher_batch_idx" ON "Voucher"("batch");

-- CreateIndex
CREATE INDEX "Voucher_status_idx" ON "Voucher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_voucherId_key" ON "Subscription"("voucherId");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

