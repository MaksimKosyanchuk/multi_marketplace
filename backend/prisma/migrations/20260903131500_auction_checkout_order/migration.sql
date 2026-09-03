ALTER TABLE "Auction" ADD COLUMN "checkoutOrderId" TEXT;
CREATE UNIQUE INDEX "Auction_checkoutOrderId_key" ON "Auction"("checkoutOrderId");
