-- Rank reward vesting.
--
-- Additive only: no existing column changes and no data is rewritten, so the
-- currently deployed code keeps working against this schema unchanged. Rewards
-- already paid in full are untouched.
CREATE TABLE "rank_reward_instalments" (
    "id"            TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "sequence"      INTEGER NOT NULL,
    "ofTotal"       INTEGER NOT NULL,
    "amount"        DECIMAL(38,8) NOT NULL,
    "dueOn"         DATE NOT NULL,
    "paidAt"        TIMESTAMP(3),
    "reference"     TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rank_reward_instalments_pkey" PRIMARY KEY ("id")
);

-- The idempotency guard: the vesting job derives this from (achievement,
-- sequence), so a replayed run collides here instead of paying twice.
CREATE UNIQUE INDEX "rank_reward_instalments_reference_key"
    ON "rank_reward_instalments"("reference");
CREATE UNIQUE INDEX "rank_reward_instalments_achievementId_sequence_key"
    ON "rank_reward_instalments"("achievementId", "sequence");

-- The monthly job's only query: what is due and not yet paid.
CREATE INDEX "rank_reward_instalments_dueOn_paidAt_idx"
    ON "rank_reward_instalments"("dueOn", "paidAt");
CREATE INDEX "rank_reward_instalments_userId_idx"
    ON "rank_reward_instalments"("userId");

ALTER TABLE "rank_reward_instalments" ADD CONSTRAINT "rank_reward_instalments_achievementId_fkey"
    FOREIGN KEY ("achievementId") REFERENCES "rank_achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rank_reward_instalments" ADD CONSTRAINT "rank_reward_instalments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
