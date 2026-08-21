-- CreateEnum
CREATE TYPE "RewardCardStatus" AS ENUM ('UNCLAIMED', 'CLAIMED');

-- AlterEnum
ALTER TYPE "LedgerCategory" ADD VALUE 'REWARD_CARD';

-- CreateTable
CREATE TABLE "reward_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "threshold" DECIMAL(38,8) NOT NULL,
    "bonusPercent" DECIMAL(10,4) NOT NULL,
    "maxBonus" DECIMAL(38,8) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_cards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "status" "RewardCardStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockedAtVolume" DECIMAL(38,8) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "reference" TEXT,

    CONSTRAINT "reward_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_cards_reference_key" ON "reward_cards"("reference");

-- CreateIndex
CREATE INDEX "reward_cards_userId_status_idx" ON "reward_cards"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reward_cards_userId_tierId_key" ON "reward_cards"("userId", "tierId");

-- AddForeignKey
ALTER TABLE "reward_cards" ADD CONSTRAINT "reward_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_cards" ADD CONSTRAINT "reward_cards_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "reward_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
