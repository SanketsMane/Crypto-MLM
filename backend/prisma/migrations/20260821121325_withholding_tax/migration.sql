-- Withholding tax on payouts.
ALTER TABLE withdrawals
  ADD COLUMN "taxPercent" DECIMAL(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN "tax"        DECIMAL(38,8) NOT NULL DEFAULT 0;

-- The arithmetic constraint has to account for the new deduction. Dropping and
-- re-adding rather than editing: a CHECK cannot be altered in place, and every
-- existing row satisfies the new form because tax defaults to zero.
ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawal_arithmetic;
ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawal_arithmetic CHECK ("netAmount" = amount - fee - tax),
  ADD CONSTRAINT withdrawal_tax_non_negative CHECK (tax >= 0),
  ADD CONSTRAINT withdrawal_tax_within_amount CHECK (tax <= amount - fee);
