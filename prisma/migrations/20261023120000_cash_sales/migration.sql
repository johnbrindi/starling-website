-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'CASH';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "recordedById" TEXT;

