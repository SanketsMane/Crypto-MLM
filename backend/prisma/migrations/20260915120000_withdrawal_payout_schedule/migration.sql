-- Settlement date for an approved withdrawal.
--
-- Nullable, and left NULL for every existing row: those were raised under
-- continuous settlement and were never promised a payout date, so inventing
-- one retrospectively would tell a member their money is due on a day nobody
-- ever committed to.
ALTER TABLE "withdrawals" ADD COLUMN "scheduledFor" DATE;

-- The payouts queue groups by settlement date; without this it is a table scan
-- once the queue grows.
CREATE INDEX "withdrawals_status_scheduledFor_idx" ON "withdrawals"("status", "scheduledFor");
