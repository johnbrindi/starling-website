-- Manual MTN MoMo payments confirmed by staff
ALTER TYPE "PaymentProvider" ADD VALUE 'MANUAL';
ALTER TABLE "Payment" ADD COLUMN "claimedAt" TIMESTAMP(3);
