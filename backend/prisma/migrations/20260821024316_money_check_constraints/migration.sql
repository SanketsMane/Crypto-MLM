-- Money invariants, enforced by the database.
--
-- The application already guards every one of these: the ledger debits with
-- `AND balance >= ?`, the cap engine clamps payouts, withdrawals validate their
-- own fee. This layer exists because that is not the only way rows can be
-- written. A migration, a psql session, an admin script or a future code path
-- that forgets the guard can all still produce a negative balance, and a
-- fintech ledger should be structurally incapable of holding one.
--
-- These are invariants, not business rules. Business rules (minimum
-- withdrawal, cap percent, trading days) stay configurable in `settings`;
-- nothing here can be tuned, because none of it is ever legitimately false.

-- Balances can never go negative, and locked funds can never exceed the balance.
ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_balance_non_negative CHECK (balance >= 0),
  ADD CONSTRAINT wallet_locked_non_negative  CHECK (locked >= 0),
  ADD CONSTRAINT wallet_locked_within_balance CHECK (locked <= balance);

-- A ledger entry always moves a positive amount; direction carries the sign.
-- The running balance it records can never be negative.
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_amount_positive        CHECK (amount > 0),
  ADD CONSTRAINT ledger_balance_non_negative   CHECK ("balanceAfter" >= 0);

-- An investment has positive capital, a non-negative ceiling, and can never be
-- credited beyond that ceiling.
ALTER TABLE investments
  ADD CONSTRAINT investment_amount_positive    CHECK (amount > 0),
  ADD CONSTRAINT investment_cap_non_negative   CHECK ("capLimit" >= 0),
  ADD CONSTRAINT investment_earned_non_negative CHECK ("totalEarned" >= 0),
  ADD CONSTRAINT investment_within_cap         CHECK ("totalEarned" <= "capLimit"),
  ADD CONSTRAINT investment_roi_non_negative   CHECK ("dailyRoiPercent" >= 0);

-- A withdrawal pays out what is left after the fee. The three figures must agree,
-- or the platform and the member disagree about what was sent.
ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawal_amount_positive    CHECK (amount > 0),
  ADD CONSTRAINT withdrawal_fee_non_negative   CHECK (fee >= 0),
  ADD CONSTRAINT withdrawal_net_positive       CHECK ("netAmount" > 0),
  ADD CONSTRAINT withdrawal_arithmetic         CHECK ("netAmount" = amount - fee);

ALTER TABLE deposits
  ADD CONSTRAINT deposit_amount_positive       CHECK (amount > 0);

-- Commissions and ROI record what was *earned* and what was actually *paid*
-- after capping. Paying more than was earned is always a bug.
ALTER TABLE commissions
  ADD CONSTRAINT commission_amount_non_negative CHECK (amount >= 0),
  ADD CONSTRAINT commission_paid_non_negative   CHECK ("paidAmount" >= 0),
  ADD CONSTRAINT commission_paid_within_earned  CHECK ("paidAmount" <= amount);

ALTER TABLE roi_accruals
  ADD CONSTRAINT roi_amount_non_negative        CHECK (amount >= 0),
  ADD CONSTRAINT roi_paid_non_negative          CHECK ("paidAmount" >= 0),
  ADD CONSTRAINT roi_paid_within_earned         CHECK ("paidAmount" <= amount);

-- A package an operator can publish must have a real price and a real ceiling.
ALTER TABLE package_plans
  ADD CONSTRAINT package_amount_positive       CHECK (amount > 0),
  ADD CONSTRAINT package_roi_non_negative      CHECK ("dailyRoiPercent" >= 0),
  ADD CONSTRAINT package_cap_positive          CHECK ("capPercent" > 0);

-- Lifetime totals only ever accumulate.
ALTER TABLE users
  ADD CONSTRAINT user_invested_non_negative    CHECK ("totalInvested" >= 0),
  ADD CONSTRAINT user_earned_non_negative      CHECK ("totalEarned" >= 0);

-- Team volume is a sum of purchases; it cannot be negative.
ALTER TABLE team_volumes
  ADD CONSTRAINT team_direct_non_negative      CHECK ("directBusiness" >= 0),
  ADD CONSTRAINT team_power_non_negative       CHECK ("powerLegVolume" >= 0),
  ADD CONSTRAINT team_other_non_negative       CHECK ("otherLegsVolume" >= 0),
  ADD CONSTRAINT team_total_non_negative       CHECK ("totalTeamBusiness" >= 0);
