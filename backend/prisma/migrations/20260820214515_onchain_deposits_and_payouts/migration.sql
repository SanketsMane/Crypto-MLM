-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('SEEN', 'CREDITED', 'IGNORED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('QUEUED', 'BROADCAST', 'CONFIRMED', 'REVERTED', 'FAILED');

-- CreateTable
CREATE TABLE "deposit_addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "derivationIndex" INTEGER NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'BEP20',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_cursors" (
    "id" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onchain_transfers" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'SEEN',
    "depositId" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "onchain_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_payouts" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'BEP20',
    "status" "PayoutStatus" NOT NULL DEFAULT 'QUEUED',
    "txHash" TEXT,
    "nonce" INTEGER,
    "gasUsed" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "broadcastAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_userId_key" ON "deposit_addresses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_address_key" ON "deposit_addresses"("address");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_derivationIndex_key" ON "deposit_addresses"("derivationIndex");

-- CreateIndex
CREATE INDEX "onchain_transfers_status_idx" ON "onchain_transfers"("status");

-- CreateIndex
CREATE INDEX "onchain_transfers_toAddress_idx" ON "onchain_transfers"("toAddress");

-- CreateIndex
CREATE UNIQUE INDEX "onchain_transfers_txHash_logIndex_key" ON "onchain_transfers"("txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "chain_payouts_withdrawalId_key" ON "chain_payouts"("withdrawalId");

-- CreateIndex
CREATE UNIQUE INDEX "chain_payouts_txHash_key" ON "chain_payouts"("txHash");

-- CreateIndex
CREATE INDEX "chain_payouts_status_idx" ON "chain_payouts"("status");

-- AddForeignKey
ALTER TABLE "deposit_addresses" ADD CONSTRAINT "deposit_addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
