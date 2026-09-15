-- Affiliate offers replace the roaming club.
--
-- The tier/award machinery is kept rather than rebuilt: it already carries
-- award tracking, the operator fulfilment queue and the member progress page,
-- and no award has ever been granted, so there is nothing to migrate. What it
-- lacked was a reward description and a validity window.
ALTER TABLE "roaming_club_tiers" ADD COLUMN "rewardLabel" TEXT;
ALTER TABLE "roaming_club_tiers" ADD COLUMN "rewardValue" DECIMAL(38,8);
ALTER TABLE "roaming_club_tiers" ADD COLUMN "validFrom"  TIMESTAMP(3);
ALTER TABLE "roaming_club_tiers" ADD COLUMN "validUntil" TIMESTAMP(3);

-- Only offers inside their window are worth scanning when evaluating a member.
CREATE INDEX "roaming_club_tiers_isActive_validUntil_idx"
  ON "roaming_club_tiers"("isActive", "validUntil");
