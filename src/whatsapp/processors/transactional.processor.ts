import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_QUEUE_IDS } from '../constants/whatsapp-queue.constants';
import { TemplateCacheService } from '../services/template-cache.service';
import { RateLimiterService } from '../services/rate-limiter.service';
import { WhatsappMessageProvider } from '../providers/whatsapp-message.provider';
import { RateLimitError } from '../errors/rate-limit.error';

@Injectable()
@Processor(WHATSAPP_QUEUE_IDS.TRANSACTIONAL)
export class TransactionalProcessor extends WorkerHost {
  private readonly logger = new Logger(TransactionalProcessor.name);

  constructor(
    private readonly templateCache: TemplateCacheService,
    private readonly rateLimiter: RateLimiterService,
    private readonly provider: WhatsappMessageProvider,
  ) {
    super();
  }

  /**
   * ⚡ TRANSACTIONAL EXECUTION PATH
   *
   * Provides a near-zero latency path for OTPs and critical alerts.
   */
  async process(job: Job<any>): Promise<any> {
    const { messageId, phone, templateId, clientId, variables, correlationId } =
      job.data;

    try {
      this.logger.debug(
        `[PROCESSOR (OTP)] Priority delivery for client ${clientId}: ${messageId}`,
      );

      if (!clientId) {
        throw new Error(`CRITICAL: Transactional job missing clientId.`);
      }

      // 1. HYDRATION (Transactional workers get priority cache lookup)
      const hydratedTemplate = await this.templateCache.getTemplate(templateId);

      if (!hydratedTemplate) {
        throw new Error(`CRITICAL: OTP template not found → ${templateId}`);
      }

      // 2. RATE LIMIT (Per-Sender Throttling applies)
      // Note: In high-priority, we might skip global throttle if sharded,
      // but for now we maintain consistency. We use 'phone' as bucket if ID not in memory.
      await this.rateLimiter.consume(phone);

      // 3. META DISPATCH (Multi-Tenant Auth Phase 2)
      const { success, wamid } = await this.provider.sendTemplateMessage({
        phone,
        clientId,
        template: hydratedTemplate,
        variables,
      });

      this.logger.log(
        `[OTP:SUCCESS] Delivered to Meta → phone=${phone} | wamid=${wamid} | client=${clientId}`,
      );

      return {
        success: true,
        wamid,
        correlationId,
      };
    } catch (error: any) {
      if (error instanceof RateLimitError) {
        // High priority - lower retry delay
        await job.moveToDelayed(Date.now() + 500);
        return;
      }

      // 🔁 RETRYABLE Error
      this.logger.warn(
        `[OTP:RETRY] Priority job failed but retryable → ${messageId}: ${error.message}`,
      );
      throw error;
    }
  }
}
