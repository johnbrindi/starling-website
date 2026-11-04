-- Customer email for password reset
ALTER TABLE "Customer" ADD COLUMN "email" TEXT;
ALTER TABLE "Customer" ADD COLUMN "resetAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
