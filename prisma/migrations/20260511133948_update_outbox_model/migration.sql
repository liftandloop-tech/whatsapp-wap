-- CreateEnum
CREATE TYPE "OutboxState" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- AlterTable
ALTER TABLE "OutboxEvent" DROP COLUMN "dispatchedAt",
ADD COLUMN     "aggregateId" TEXT,
ADD COLUMN     "aggregateType" TEXT,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "state" "OutboxState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "traceId" TEXT;

-- CreateIndex
CREATE INDEX "OutboxEvent_state_idx" ON "OutboxEvent"("state");

-- CreateIndex
CREATE INDEX "OutboxEvent_traceId_idx" ON "OutboxEvent"("traceId");

