import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WHATSAPP_QUEUE_IDS } from '../constants/whatsapp-queue.constants';
import { TemplateCacheService } from '../services/template-cache.service';
import { RateLimiterService } from '../services/rate-limiter.service';
import { WhatsappMessageProvider } from '../providers/whatsapp-message.provider';
import { RateLimitError } from '../errors/rate-limit.error';
import { CampaignGuardService } from '../services/campaign-guard.service';
import axios from 'axios';
import { Message } from '../schemas/message.schema';

@Injectable()
@Processor(WHATSAPP_QUEUE_IDS.BULK)
export class BulkProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkProcessor.name);

  constructor(
    private readonly templateCache: TemplateCacheService,
    private readonly rateLimiter: RateLimiterService,
    private readonly provider: WhatsappMessageProvider,
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
    private readonly campaignGuard: CampaignGuardService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { messageId, phone, templateId, variables, campaignId } = job.data;
    let clientId: number | undefined;

    try {
      const message = await this.messageModel.findById(messageId);
      if (!message) {
        this.logger.error({
          event: 'CRITICAL_MESSAGE_MISSING',
          messageId,
          msg: 'Message record evicted or deleted',
        });
        return;
      }

      clientId = message.clientId;

      // 1. HYDRATION
      const hydratedTemplate = await this.templateCache.getTemplate(templateId);
      if (!hydratedTemplate) {
        throw new Error(`UNRECOVERABLE: Template ${templateId} missing`);
      }

      // 🚨 2. FINANCIAL ATOMIC DEBIT
      let debited = false;
      let lastDebitError: any = null;

      try {
        await axios.post(
          `${process.env.BACKEND_INTERNAL_URL}/debit`,
          {
            clientId,
            campaignId: campaignId.toString(),
            messageId,
            category: hydratedTemplate.category?.toUpperCase() || 'MARKETING',
          },
          {
            headers: {
              'x-internal-secret':
                process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
            },
          },
        );
        debited = true;
      } catch (debitErr: any) {
        lastDebitError = debitErr;
        const httpStatus = debitErr.response?.status;
        const errorData = debitErr.response?.data;
        this.logger.error(
          `[DEBIT_PRIMARY_FAIL] HTTP ${httpStatus ?? 'NO_RESPONSE'} — ${debitErr.message}` +
          (httpStatus === 530 ? ' ← Cloudflare 530: swakora-backend origin is unreachable. Is the backend running on port 3300?' : ''),
        );
        if (
          httpStatus === 402 ||
          errorData?.error === 'INSUFFICIENT_FUNDS'
        ) {
          throw new Error('UNRECOVERABLE: INSUFFICIENT_FUNDS');
        }
      }

      // If primary debit failed, try local loopback fallback (bypasses Cloudflare / public network issues)
      if (!debited && process.env.BACKEND_INTERNAL_URL !== 'http://localhost:3300/api/internal/whatsapp') {
        try {
          this.logger.warn(
            `[DEBIT_FALLBACK] Primary debit URL failed (${lastDebitError.message}). Attempting local loopback fallback...`,
          );
          await axios.post(
            `http://localhost:3300/api/internal/whatsapp/debit`,
            {
              clientId,
              campaignId: campaignId.toString(),
              messageId,
              category: hydratedTemplate.category?.toUpperCase() || 'MARKETING',
            },
            {
              headers: {
                'x-internal-secret':
                  process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
              },
            },
          );
          debited = true;
        } catch (fallbackErr: any) {
          lastDebitError = fallbackErr;
          const httpStatus = fallbackErr.response?.status;
          const errorData = fallbackErr.response?.data;
          this.logger.error(
            `[DEBIT_FALLBACK_FAIL] HTTP ${httpStatus ?? 'NO_RESPONSE'} — ${fallbackErr.message}` +
            (httpStatus === 530 ? ' ← Cloudflare 530: swakora-backend is down or port 3300 unreachable.' : ''),
          );
          if (
            httpStatus === 402 ||
            errorData?.error === 'INSUFFICIENT_FUNDS'
          ) {
            throw new Error('UNRECOVERABLE: INSUFFICIENT_FUNDS');
          }
        }
      }

      if (!debited) {
        this.logger.error(
          `[DEBIT_FAILURE] Pre-dispatch debit failed for Message=${messageId}: ${lastDebitError.message}`,
        );
        throw new Error(`RETRYABLE: Debit bridge failure: ${lastDebitError.message}`);
      }

      // 3. ISOLATED RATE LIMITING
      await this.rateLimiter.consume(message.from);

      // 🧠 4. QUALITY GUARD & ADAPTIVE THROTTLING
      const credentials = await this.provider
        .getCredentialService()
        .getCredentials(clientId);
      if (credentials.qualityRating === 'RED') {
        throw new Error(
          'UNRECOVERABLE: Quality Rating RED. Sending paused by System Guard.',
        );
      }
      if (credentials.qualityRating === 'YELLOW') {
        this.logger.warn(
          `[THROTTLE_ADAPTIVE] Client=${clientId} has YELLOW quality. Adding 500ms delay.`,
        );
        await new Promise((res) => setTimeout(res, 500));
      }

      // 5. MESSAGE DISPATCH
      const { success, wamid } = await this.provider.sendTemplateMessage({
        phone,
        clientId,
        template: hydratedTemplate,
        variables,
        mediaId: message.mediaId,
      });

      if (wamid) {
        await this.messageModel.updateOne(
          { _id: messageId },
          {
            $set: {
              providerMessageId: wamid,
              status: 'sent',
              sentAt: new Date(),
            },
          },
        );
      }

      // 🏁 6. CHECK COMPLETION (Phase 6: Cleanup)
      await this.campaignGuard.checkCompletion(campaignId.toString());

      this.logger.log({
        event: 'MESSAGE_DISPATCHED',
        wamid,
        phone,
        clientId,
        sender: message.from,
      });

      return { success, wamid };
    } catch (error: any) {
      if (error instanceof RateLimitError) {
        await job.moveToDelayed(Date.now() + error.retryAfterMs);
        return;
      }

      const isRetriable = WhatsappMessageProvider.isRetriable(error);
      const isFatal =
        error.message.includes('UNRECOVERABLE') ||
        !isRetriable ||
        job.attemptsMade >= 3;

      // Persist failure trace for Audit visibility
      await this.messageModel.updateOne(
        { _id: messageId },
        {
          $set: {
            failureReason: error.message,
            failedAt: new Date(),
            retryCount: job.attemptsMade,
          },
        },
      );

      if (isFatal) {
        this.logger.error({
          event: 'MESSAGE_FAILED_FATAL',
          messageId,
          reason: error.message,
          attempts: job.attemptsMade,
        });

        await this.messageModel.updateOne(
          { _id: messageId },
          { $set: { status: 'dead' } },
        );

        // 🔄 TRIGGER REFUND
        let refunded = false;
        try {
          await axios.post(
            `${process.env.BACKEND_INTERNAL_URL}/refund`,
            {
              clientId,
              messageId,
            },
            {
              headers: {
                'x-internal-secret':
                  process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
              },
            },
          );
          refunded = true;
        } catch (refundErr: any) {
          this.logger.warn(
            `[REFUND_FALLBACK] Primary refund URL failed (${refundErr.message}). Attempting local loopback fallback...`,
          );
        }

        if (!refunded && process.env.BACKEND_INTERNAL_URL !== 'http://localhost:3300/api/internal/whatsapp') {
          try {
            await axios.post(
              `http://localhost:3300/api/internal/whatsapp/refund`,
              {
                clientId,
                messageId,
              },
              {
                headers: {
                  'x-internal-secret':
                    process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
                },
              },
            );
            refunded = true;
          } catch (fallbackRefundErr: any) {
            this.logger.error(
              `[REFUND_SYSTEM_FAILURE] Failed to refund Client=${clientId}: ${fallbackRefundErr.message}`,
            );
          }
        }

        // 🏁 CHECK COMPLETION EVEN ON FATAL
        await this.campaignGuard.checkCompletion(campaignId.toString());

        return;
      }

      throw error; // Let BullMQ handle retry if not fatal
    }
  }
}
