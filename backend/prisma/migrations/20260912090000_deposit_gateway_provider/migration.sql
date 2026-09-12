-- Which checkout raised a gateway deposit.
--
-- `gatewayTrackId` is unique only WITHIN a provider: two gateways can mint the
-- same id independently, so a callback matched on track id alone could credit
-- the wrong deposit once a second provider is live. This column is what keeps
-- the two apart, and what tells an operator which checkout a pending row
-- belongs to.
--
-- Nullable on purpose. Rows raised before this migration have no provider
-- recorded, and manually reported deposits never had one — so the callback
-- path must treat NULL as "match on track id alone" rather than assuming a
-- value is present.
ALTER TABLE "deposits" ADD COLUMN "gatewayProvider" TEXT;

-- Backfill what can be known for certain: anything already carrying a gateway
-- track id was raised by the only provider that was live at the time.
UPDATE "deposits"
   SET "gatewayProvider" = 'nowpayments'
 WHERE "gatewayTrackId" IS NOT NULL
   AND "gatewayProvider" IS NULL;

CREATE INDEX "deposits_gatewayProvider_idx" ON "deposits"("gatewayProvider");
