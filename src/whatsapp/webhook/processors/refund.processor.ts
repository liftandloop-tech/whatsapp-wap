import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import { WHATSAPP_QUEUE_IDS } from '../../constants/whatsapp-queue.constants';

export interface RefundJobData {
  clientId: number;
  messageId: string;
}

/**
 * 💰 RefundProcessor
 *
 * Durable BullMQ replacement for the `setImmediate(() => refund())` pattern.
 *
 * Why BullMQ and not setImmediate?
 * - setImmediate is fire-and-forget: if the process dies between the status DB
 *   write and the refund HTTP call, the refund is permanently lost with no retry.
 * - BullMQ persists the job in Redis before the message status is marked as
 *   failed, so process restarts, crashes, or OOM kills cannot drop a refund.
 *
 * Retry policy: exponential backoff (1s, 2s, 4s, 8s, 16s) — 5 attempts total.
 * If all 5 fail, the job is retained in the failed set for manual replay.
 */
@Injectable()
@Processor(WHATSAPP_QUEUE_IDS.REFUND)
export class RefundProcessor extends WorkerHost {
  private readonly logger = new Logger(RefundProcessor.name);

  async process(job: Job<RefundJobData>): Promise<void> {
    const { clientId, messageId } = job.data;

    this.logger.log(
      `[REFUND] Processing refund for Client=${clientId}, Message=${messageId} (attempt ${job.attemptsMade + 1})`,
    );

    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ||
      'http://localhost:5000/api/internal/whatsapp';
    const secret = process.env.INTERNAL_SYNC_SECRET || 'sync_987654321';

    await axios.post(
      `${backendUrl}/refund`,
      { clientId, messageId },
      {
        headers: { 'x-internal-secret': secret },
        timeout: 10_000,
      },
    );

    this.logger.log(
      `[REFUND] ✅ Refund issued for Client=${clientId}, Message=${messageId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RefundJobData>, err: Error): void {
    const isFinal = job.attemptsMade >= (job.opts?.attempts ?? 5);
    const { clientId, messageId } = job.data;

    if (isFinal) {
      this.logger.error(
        `[REFUND][DLQ] ❌ Refund permanently failed after ${job.attemptsMade} attempts. ` +
          `Client=${clientId} | Message=${messageId} | Error: ${err.message}`,
      );
    } else {
      this.logger.warn(
        `[REFUND][RETRY] Attempt ${job.attemptsMade}/${job.opts?.attempts ?? 5} failed: ${err.message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(`[REFUND] Job ${job.id} completed`);
  }
}
