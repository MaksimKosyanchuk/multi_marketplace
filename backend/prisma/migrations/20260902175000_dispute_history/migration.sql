CREATE TABLE "DisputeHistory" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DisputeHistory_disputeId_createdAt_idx" ON "DisputeHistory"("disputeId", "createdAt");
ALTER TABLE "DisputeHistory" ADD CONSTRAINT "DisputeHistory_disputeId_fkey"
FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeHistory" ADD CONSTRAINT "DisputeHistory_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
