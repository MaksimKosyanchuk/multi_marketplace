CREATE TABLE "EventConsumerReceipt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "consumerName" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventConsumerReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventConsumerReceipt_eventId_consumerName_key" ON "EventConsumerReceipt"("eventId", "consumerName");
CREATE INDEX "EventConsumerReceipt_consumerName_processedAt_idx" ON "EventConsumerReceipt"("consumerName", "processedAt");