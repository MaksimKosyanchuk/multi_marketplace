ALTER TABLE "Bid" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Bid_idempotencyKey_key" ON "Bid"("idempotencyKey");