-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "gatewayStatus" TEXT,
ADD COLUMN     "gatewayTrackId" TEXT,
ADD COLUMN     "paymentUrl" TEXT;

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "gatewayStatus" TEXT,
ADD COLUMN     "gatewayTrackId" TEXT;

-- CreateTable
CREATE TABLE "gateway_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'oxapay',
    "kind" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gateway_events_trackId_status_idx" ON "gateway_events"("trackId", "status");

-- CreateIndex
CREATE INDEX "gateway_events_createdAt_idx" ON "gateway_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_gatewayTrackId_key" ON "deposits"("gatewayTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_gatewayTrackId_key" ON "withdrawals"("gatewayTrackId");

