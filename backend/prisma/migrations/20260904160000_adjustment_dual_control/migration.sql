-- Dual control on manual balance adjustments.
--
-- Additive: no existing table or column changes, so the currently deployed code
-- runs unchanged against this schema. Adjustments already made are untouched.
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "balance_adjustment_requests" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "walletType"    "WalletType" NOT NULL,
    "direction"     "LedgerDirection" NOT NULL,
    "amount"        DECIMAL(38,8) NOT NULL,
    "reason"        TEXT NOT NULL,
    "status"        "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById"   TEXT,
    "decidedAt"     TIMESTAMP(3),
    "decisionNote"  TEXT,
    "reference"     TEXT,
    CONSTRAINT "balance_adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- One ledger entry per approved request; the unique reference is what stops a
-- double approval from paying twice.
CREATE UNIQUE INDEX "balance_adjustment_requests_reference_key"
    ON "balance_adjustment_requests"("reference");
CREATE INDEX "balance_adjustment_requests_status_requestedAt_idx"
    ON "balance_adjustment_requests"("status", "requestedAt");
CREATE INDEX "balance_adjustment_requests_userId_idx"
    ON "balance_adjustment_requests"("userId");

ALTER TABLE "balance_adjustment_requests" ADD CONSTRAINT "balance_adjustment_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "balance_adjustment_requests" ADD CONSTRAINT "balance_adjustment_requests_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "balance_adjustment_requests" ADD CONSTRAINT "balance_adjustment_requests_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
