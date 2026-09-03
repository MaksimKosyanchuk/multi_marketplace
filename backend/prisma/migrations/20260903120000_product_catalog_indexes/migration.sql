-- Add composite indexes used by public catalog and PostgreSQL fallback queries.
CREATE INDEX "Product_sellerId_status_isArchived_idx"
ON "Product"("sellerId", "status", "isArchived");

CREATE INDEX "Product_categoryId_status_isArchived_idx"
ON "Product"("categoryId", "status", "isArchived");

CREATE INDEX "Product_status_isArchived_createdAt_idx"
ON "Product"("status", "isArchived", "createdAt");
