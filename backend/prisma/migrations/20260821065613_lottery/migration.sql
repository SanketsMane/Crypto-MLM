-- CreateEnum
CREATE TYPE "LotteryStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'DRAWN', 'CANCELLED');

-- AlterEnum
ALTER TYPE "LedgerCategory" ADD VALUE 'LOTTERY_PRIZE';

-- CreateTable
CREATE TABLE "lottery_draws" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "status" "LotteryStatus" NOT NULL DEFAULT 'DRAFT',
    "ticketThreshold" DECIMAL(38,8) NOT NULL,
    "maxTicketsPerMember" INTEGER NOT NULL DEFAULT 50,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "seedHash" TEXT,
    "seed" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lottery_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_prizes" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "winnerTicketId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "reference" TEXT,

    CONSTRAINT "lottery_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_tickets" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAtVolume" DECIMAL(38,8) NOT NULL,

    CONSTRAINT "lottery_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lottery_draws_status_drawnAt_idx" ON "lottery_draws"("status", "drawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_prizes_winnerTicketId_key" ON "lottery_prizes"("winnerTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_prizes_reference_key" ON "lottery_prizes"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_prizes_drawId_position_key" ON "lottery_prizes"("drawId", "position");

-- CreateIndex
CREATE INDEX "lottery_tickets_drawId_userId_idx" ON "lottery_tickets"("drawId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_tickets_drawId_number_key" ON "lottery_tickets"("drawId", "number");

-- AddForeignKey
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_winnerTicketId_fkey" FOREIGN KEY ("winnerTicketId") REFERENCES "lottery_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_tickets" ADD CONSTRAINT "lottery_tickets_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_tickets" ADD CONSTRAINT "lottery_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
