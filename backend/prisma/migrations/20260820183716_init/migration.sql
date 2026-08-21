-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AffiliateMode" AS ENUM ('PASSIVE', 'ACTIVE');

-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('MAIN', 'FUND', 'DIGITAL');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "LedgerCategory" AS ENUM ('DEPOSIT', 'INVESTMENT', 'DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS', 'ROAMING_CLUB', 'WITHDRAWAL', 'FEE', 'REFUND', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('ACTIVE', 'CAPPED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionKind" AS ENUM ('DIRECT', 'GENERATION');

-- CreateEnum
CREATE TYPE "RoamingTrack" AS ENUM ('AFFILIATE', 'SELF_CAPITALIST');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "affiliateMode" "AffiliateMode" NOT NULL DEFAULT 'PASSIVE',
    "sponsorId" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "directCount" INTEGER NOT NULL DEFAULT 0,
    "activeDirectCount" INTEGER NOT NULL DEFAULT 0,
    "totalInvested" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "totalEarned" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "walletAddress" TEXT,
    "currentRankId" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "WalletType" NOT NULL,
    "balance" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "locked" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "category" "LedgerCategory" NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "balanceAfter" DECIMAL(38,8) NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" "TxStatus" NOT NULL DEFAULT 'PROCESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "dailyRoiPercent" DECIMAL(10,4) NOT NULL,
    "capPercent" DECIMAL(10,4) NOT NULL DEFAULT 250,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "dailyRoiPercent" DECIMAL(10,4) NOT NULL,
    "capLimit" DECIMAL(38,8) NOT NULL,
    "totalEarned" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccrualDate" TIMESTAMP(3),
    "cappedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roi_accruals" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accrualDate" DATE NOT NULL,
    "baseAmount" DECIMAL(38,8) NOT NULL,
    "ratePercent" DECIMAL(10,4) NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "paidAmount" DECIMAL(38,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roi_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "kind" "CommissionKind" NOT NULL,
    "level" INTEGER NOT NULL,
    "percent" DECIMAL(10,4) NOT NULL,
    "requiredDirects" INTEGER NOT NULL DEFAULT 0,
    "requiredTeamVolume" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "investmentId" TEXT,
    "kind" "CommissionKind" NOT NULL,
    "level" INTEGER NOT NULL,
    "percent" DECIMAL(10,4) NOT NULL,
    "baseAmount" DECIMAL(38,8) NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "paidAmount" DECIMAL(38,8) NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PROCESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "selfCapital" DECIMAL(38,8) NOT NULL,
    "teamBusiness" DECIMAL(38,8) NOT NULL,
    "reward" DECIMAL(38,8) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rank_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rankId" TEXT NOT NULL,
    "teamBusinessAtAchievement" DECIMAL(38,8) NOT NULL,
    "powerLegVolume" DECIMAL(38,8) NOT NULL,
    "otherLegsVolume" DECIMAL(38,8) NOT NULL,
    "rewardAmount" DECIMAL(38,8) NOT NULL,
    "rewardPaidAt" TIMESTAMP(3),
    "reference" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_volumes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "directBusiness" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "totalTeamBusiness" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "powerLegVolume" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "otherLegsVolume" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "teamSize" INTEGER NOT NULL DEFAULT 0,
    "recalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_volumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roaming_club_tiers" (
    "id" TEXT NOT NULL,
    "track" "RoamingTrack" NOT NULL,
    "destination" TEXT NOT NULL,
    "selfRequirement" DECIMAL(38,8) NOT NULL,
    "teamRequirement" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roaming_club_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roaming_club_awards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'APPROVED',
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "roaming_club_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'BEP20',
    "txHash" TEXT,
    "reference" TEXT NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "feePercent" DECIMAL(10,4) NOT NULL,
    "fee" DECIMAL(38,8) NOT NULL,
    "netAmount" DECIMAL(38,8) NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'BEP20',
    "txHash" TEXT,
    "reference" TEXT NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_userCode_key" ON "users"("userCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_sponsorId_idx" ON "users"("sponsorId");

-- CreateIndex
CREATE INDEX "users_path_idx" ON "users"("path");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_userId_type_key" ON "wallet_accounts"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reference_key" ON "ledger_entries"("reference");

-- CreateIndex
CREATE INDEX "ledger_entries_userId_createdAt_idx" ON "ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_category_idx" ON "ledger_entries"("category");

-- CreateIndex
CREATE INDEX "ledger_entries_sourceType_sourceId_idx" ON "ledger_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "investments_userId_status_idx" ON "investments"("userId", "status");

-- CreateIndex
CREATE INDEX "investments_status_lastAccrualDate_idx" ON "investments"("status", "lastAccrualDate");

-- CreateIndex
CREATE INDEX "roi_accruals_userId_accrualDate_idx" ON "roi_accruals"("userId", "accrualDate");

-- CreateIndex
CREATE UNIQUE INDEX "roi_accruals_investmentId_accrualDate_key" ON "roi_accruals"("investmentId", "accrualDate");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_kind_level_key" ON "commission_rules"("kind", "level");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_reference_key" ON "commissions"("reference");

-- CreateIndex
CREATE INDEX "commissions_userId_createdAt_idx" ON "commissions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "commissions_fromUserId_idx" ON "commissions"("fromUserId");

-- CreateIndex
CREATE UNIQUE INDEX "rank_definitions_code_key" ON "rank_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rank_definitions_level_key" ON "rank_definitions"("level");

-- CreateIndex
CREATE UNIQUE INDEX "rank_achievements_reference_key" ON "rank_achievements"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "rank_achievements_userId_rankId_key" ON "rank_achievements"("userId", "rankId");

-- CreateIndex
CREATE UNIQUE INDEX "team_volumes_userId_key" ON "team_volumes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "roaming_club_tiers_track_destination_key" ON "roaming_club_tiers"("track", "destination");

-- CreateIndex
CREATE UNIQUE INDEX "roaming_club_awards_userId_tierId_key" ON "roaming_club_awards"("userId", "tierId");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_txHash_key" ON "deposits"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_reference_key" ON "deposits"("reference");

-- CreateIndex
CREATE INDEX "deposits_userId_status_idx" ON "deposits"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_reference_key" ON "withdrawals"("reference");

-- CreateIndex
CREATE INDEX "withdrawals_userId_status_idx" ON "withdrawals"("userId", "status");

-- CreateIndex
CREATE INDEX "withdrawals_status_slaDueAt_idx" ON "withdrawals"("status", "slaDueAt");

-- CreateIndex
CREATE INDEX "support_tickets_userId_status_idx" ON "support_tickets"("userId", "status");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_idx" ON "ticket_messages"("ticketId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_currentRankId_fkey" FOREIGN KEY ("currentRankId") REFERENCES "rank_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roi_accruals" ADD CONSTRAINT "roi_accruals_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roi_accruals" ADD CONSTRAINT "roi_accruals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_achievements" ADD CONSTRAINT "rank_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_achievements" ADD CONSTRAINT "rank_achievements_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "rank_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_volumes" ADD CONSTRAINT "team_volumes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roaming_club_awards" ADD CONSTRAINT "roaming_club_awards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roaming_club_awards" ADD CONSTRAINT "roaming_club_awards_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "roaming_club_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
