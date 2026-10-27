-- AlterTable
ALTER TABLE "AccessCredential" ADD COLUMN "pausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NetworkCommand" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "credentialId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "NetworkCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceBlock" (
    "id" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NetworkCommand_doneAt_createdAt_idx" ON "NetworkCommand"("doneAt", "createdAt");
CREATE UNIQUE INDEX "DeviceBlock_macAddress_key" ON "DeviceBlock"("macAddress");
