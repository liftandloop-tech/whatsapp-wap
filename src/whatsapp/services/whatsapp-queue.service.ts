import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  WHATSAPP_QUEUE_IDS,
  WHATSAPP_JOB_NAMES,
} from '../constants/whatsapp-queue.constants';

@Injectable()
export class WhatsappQueueService {
  private readonly logger = new Logger(WhatsappQueueService.name);
  private readonly maxWaiting: number;

  constructor(
    @InjectQueue(WHATSAPP_QUEUE_IDS.BULK) private readonly bulkQueue: Queue,
    @InjectQueue(WHATSAPP_QUEUE_IDS.TRANSACTIONAL)
    private readonly transactionalQueue: Queue,
    private readonly config: ConfigService,
  ) {
    this.maxWaiting = this.config.get<number>(
      'WHATSAPP_BULK_QUEUE_MAX_WAITING',
      500000,
    );
  }

  /**
   * Pushes a single transactional message (OTP, Alert) to the high-priority queue.
   */
  async addTransactionalMessage(payload: any, priority = 1) {
    const correlationId = uuidv4();
    const phone = this.normalizePhone(payload.phone);

    const enrichedPayload = Object.freeze({
      ...payload,
      phone,
      correlationId,
      createdAt: Date.now(),
      queueType: 'transactional',
    });

    this.logger.log(
      `[Queue] Adding transactional message. CorrelationId: ${correlationId}`,
    );

    return this.transactionalQueue.add(
      WHATSAPP_JOB_NAMES.SEND_OTP,
      enrichedPayload,
      {
        priority,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        jobId: payload.messageId || correlationId,
        removeOnComplete: 5000,
        timeout: 15000,
      } as any,
    );
  }

  /**
   * Pushes a batch of campaign messages to the bulk queue using chunking and micro-throttling.
   */
  async addBulkMessages(campaignId: string, recipients: any[], delayMs = 0) {
    if (!recipients.length) {
      throw new BadRequestException('Recipient list cannot be empty');
    }

    // 1. Backpressure Guard (80% warning, 100% block)
    const waiting = await this.bulkQueue.getWaitingCount();
    const active = await this.bulkQueue.getActiveCount();
    const currentWait = waiting + active;

    if (currentWait > this.maxWaiting) {
      this.logger.error(
        `[Queue] HARD BLOCK: Bulk queue overloaded (${currentWait}/${this.maxWaiting})`,
      );
      throw new ServiceUnavailableException(
        'Messaging queue is currently overloaded. Please try again later.',
      );
    }

    if (currentWait > this.maxWaiting * 0.8) {
      this.logger.warn(
        `[Queue] WARNING: Bulk queue load high (${currentWait}/${this.maxWaiting})`,
      );
    }

    // 2. Chunking & Ingestion Loop
    const chunkSize = 500;
    const totalRecipients = recipients.length;
    this.logger.log(
      `[Queue] Starting bulk ingestion for campaign ${campaignId}. Total: ${totalRecipients}`,
    );

    for (let i = 0; i < totalRecipients; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);

      // Map recipients to BullMQ bulk jobs with idempotency and delay
      const jobs = chunk.map((msg) => {
        const phone = this.normalizePhone(msg.phone);
        const payload = Object.freeze({
          ...msg,
          phone,
          campaignId,
          createdAt: Date.now(),
          correlationId: uuidv4(),
          queueType: 'bulk',
        });

        // Ensure payload size is safe (e.g., < 102400 bytes)
        const size = Buffer.byteLength(JSON.stringify(payload));
        if (size > 102400) {
          throw new BadRequestException(
            `Message payload too large for messageId: ${msg.messageId}`,
          );
        }

        return {
          name: WHATSAPP_JOB_NAMES.SEND_TEMPLATE,
          data: payload,
          opts: {
            jobId: msg.messageId, // Message-level idempotency
            delay: delayMs > 0 ? delayMs : chunkIndex * 10, // Targeted delay or default stagger
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            timeout: 15000,
          } as any,
        };
      });

      try {
        await this.bulkQueue.addBulk(jobs);
        this.logger.log(
          `[Queue] Enqueued chunk ${chunkIndex + 1} (${jobs.length} jobs) for ${campaignId}`,
        );

        // 3. Micro-throttle between chunks to protect Redis/Network
        if (i + chunkSize < totalRecipients) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } catch (error) {
        this.logger.error(
          `[Queue] FAILED to enqueue chunk for campaign ${campaignId}: ${error.message}`,
        );
        throw new ServiceUnavailableException(
          'Intermittent failure during bulk ingestion. Some messages may have been queued.',
        );
      }
    }

    this.logger.log(
      `[Queue] Bulk ingestion complete for campaign ${campaignId}`,
    );
  }

  /**
   * Normalizes phone numbers to standard E.164-like format for Meta.
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, ''); // Remove non-digits
  }
}
