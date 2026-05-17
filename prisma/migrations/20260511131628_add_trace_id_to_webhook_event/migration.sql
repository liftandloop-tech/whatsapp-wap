-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "traceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_traceId_key" ON "WebhookEvent"("traceId");

-- CreateIndex
CREATE INDEX "WebhookEvent_traceId_idx" ON "WebhookEvent"("traceId");

