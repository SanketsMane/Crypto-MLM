-- Payout address cooling-off.
--
-- Hand-written rather than generated, because this database carries migrations
-- that are not in the repository and `migrate dev` would offer to reset it.
-- Additive and nullable, so old code keeps running against it unchanged.
ALTER TABLE "users" ADD COLUMN "walletAddressChangedAt" TIMESTAMP(3);
