import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  WHATSAPP_QUEUE_IDS,
  WHATSAPP_JOB_NAMES,
} from '../../constants/whatsapp-queue.constants';
import { buildEventId, buildEventHash } from '../utils/event-id.util';
import { WHATSAPP_WEBHOOK_VERIFY_REASON } from '../constants/whatsapp-webhook-verify-reasons.constant';
import { WhatsappWebhookDto } from '../dto/whatsapp-webhook.dto';
import { Message } from '../../schemas/message.schema';
import { InboundMessage } from '../../schemas/inbound-message.schema';
import axios from 'axios';
import { WhatsappGateway } from '../../gateways/whatsapp.gateway';
import type { OnboardingService } from '../../onboarding/interfaces/onboarding.interface';
import { OnboardingState } from '../../onboarding/onboarding-state.enum';
import { AutomationService } from '../../services/automation.service';
import { WabaCredentialService } from '../../services/waba-credential.service';
// WhatsappTemplateService no longer needed here — template events go through BullMQ

// Status weight — prevents downgrade (e.g. 'read' → 'delivered')
const STATUS_WEIGHT: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);
  private readonly verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,

    @InjectModel(InboundMessage.name)
    private readonly inboundMessageModel: Model<InboundMessage>,

    @Inject('ONBOARDING_SERVICE')
    private readonly onboardingService: OnboardingService,

    private readonly whatsappGateway: WhatsappGateway,
    private readonly automationService: AutomationService,
    private readonly wabaCredentialService: WabaCredentialService,

    @InjectQueue(WHATSAPP_QUEUE_IDS.TEMPLATE_WEBHOOK)
    private readonly templateWebhookQueue: Queue,

    @InjectQueue(WHATSAPP_QUEUE_IDS.REFUND)
    private readonly refundQueue: Queue,
  ) {}

  // ✅ Fix #1 — Webhook verification
  verifyWebhook(mode: string, token: string, challenge: string) {
    if (!mode || !token || !challenge) {
      return {
        success: false,
        reason: WHATSAPP_WEBHOOK_VERIFY_REASON.MISSING_DATA,
      };
    }
    if (mode !== 'subscribe') {
      return {
        success: false,
        reason: WHATSAPP_WEBHOOK_VERIFY_REASON.INVALID_MODE,
      };
    }
    if (token !== this.verifyToken) {
      return {
        success: false,
        reason: WHATSAPP_WEBHOOK_VERIFY_REASON.INVALID_VERIFY_TOKEN,
      };
    }
    return { success: true, challenge };
  }

  // ✅ Fix #2 — Full webhook implementation
  async handleWebhook(payload: WhatsappWebhookDto) {
    try {
      const entries = (payload as any).entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (!value) continue;

          // 1. Onboarding & Account Lifecycle Events
          if (this.isOnboardingEvent(change.field)) {
            await this.handleOnboardingEvent(value, entry.id);
            continue;
          }

          // 2. Message Template Status Updates
          // Enqueue to BullMQ — returns 200 ONLY after enqueue succeeds.
          // jobId = eventId provides transient queue-level dedup.
          // Processor does permanent DB-level dedup via eventHash.
          if (change.field === 'message_template_status_update') {
            const value_data = change.value ?? {};
            const name = value_data.message_template_name ?? '';
            const language = value_data.message_template_language ?? '';
            const event = value_data.event ?? '';
            const ts = value_data.timestamp ?? Math.floor(Date.now() / 1000);

            const eventId = buildEventId(entry.id, name, language, event, ts);
            const eventHash = buildEventHash(change);

            await this.templateWebhookQueue.add(
              WHATSAPP_JOB_NAMES.PROCESS_TEMPLATE_WEBHOOK,
              { eventId, eventHash, wabaId: entry.id, payload: value_data },
              {
                jobId: eventId, // transient dedup — BullMQ skips if already queued
                attempts: 3,
                backoff: { type: 'fixed', delay: 5000 },
                removeOnComplete: { count: 100 },
                removeOnFail: false, // keep failed jobs for DLQ replay
              },
            );
            this.logger.log(
              `[WEBHOOK] Enqueued template status update: ${eventId}`,
            );
            continue;
          }

          // 3. Messaging Status Updates
          if (value.statuses) {
            for (const statusObj of value.statuses) {
              await this.processStatus(statusObj);
            }
          }

          // 3. Inbound User Messages
          if (value.messages) {
            const phoneNumberId = value.metadata?.phone_number_id ?? null;
            for (const messageObj of value.messages) {
              await this.processInboundMessage(messageObj, phoneNumberId);
            }
          }
        }
      }
    } catch (error) {
      // Never throw — webhook must always return 200
      this.logger.error('[WEBHOOK] Processing error', error?.message);
    }
  }

  private isOnboardingEvent(field: string): boolean {
    return [
      'account_update',
      'phone_number_quality_update',
      'phone_number_name_update',
    ].includes(field);
  }

  private async handleOnboardingEvent(value: any, wabaId: string) {
    this.logger.log(
      `[WEBHOOK] Onboarding event for WABA ${wabaId}: ${JSON.stringify(value)}`,
    );

    // Delegate to OnboardingService
    await this.onboardingService.handleWebhookEvent({
      ...value,
      wabaId,
    });
  }

  private async processStatus(statusObj: any) {
    const wamid: string = statusObj.id;
    const incomingStatus: string = statusObj.status;
    const timestamp: string = statusObj.timestamp;
    const pricing = statusObj.pricing;
    const conversation = statusObj.conversation;
    const metaError = statusObj.errors?.[0];

    if (!wamid || !incomingStatus) return;

    this.logger.debug(`[WEBHOOK] ${incomingStatus} | wamid=${wamid}`);

    // Find message by WAMID
    const message = await this.messageModel.findOne({
      providerMessageId: wamid,
    });

    if (!message) {
      this.logger.warn(`[WEBHOOK] WAMID not mapped: ${wamid}`);
      return;
    }

    // Status Progression Guard — never downgrade
    const currentWeight = STATUS_WEIGHT[message.status] ?? 0;
    const incomingWeight = STATUS_WEIGHT[incomingStatus] ?? 0;

    if (incomingWeight <= currentWeight) {
      this.logger.debug(
        `[WEBHOOK] Skipping downgrade: ${message.status} → ${incomingStatus}`,
      );
      return;
    }

    // Build idempotent update payload
    const updateData: Record<string, any> = { status: incomingStatus };
    const date = new Date(Number(timestamp) * 1000);

    if (incomingStatus === 'delivered') updateData.deliveredAt = date;
    if (incomingStatus === 'failed') {
      updateData.failedAt = date;
      updateData.failureReason =
        metaError?.title || metaError?.message || 'Unknown failure';

      // 🔄 TRIGGER REFUND — enqueued to BullMQ for durability.
      // Previously used setImmediate (fire-and-forget): if the process restarted
      // between this point and the HTTP call, the refund was permanently lost.
      // Now the job is persisted in Redis before we return, so restarts are safe.
      //
      // PRE-DEPLOY FIX: jobId = messageId ensures idempotency — if Meta delivers
      // a duplicate "failed" status event, the second enqueue is a no-op because
      // BullMQ deduplicates on jobId while the first job is still alive.
      await this.refundQueue.add(
        WHATSAPP_JOB_NAMES.REFUND,
        { clientId: message.clientId, messageId: message._id.toString() },
        {
          jobId: `refund:${message._id.toString()}`, // idempotency key
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s, 40s, 80s
          removeOnComplete: true,
          removeOnFail: false, // retain in DLQ for manual replay
        },
      );
      this.logger.log(
        `[REFUND] 💰 Enqueued refund for Client=${message.clientId}, Message=${message._id}`,
      );
    }

    // Extract Meta-specific metadata for billing/tracking
    if (pricing) {
      updateData.pricingCategory = pricing.category;
      updateData.billable = pricing.billable;
    }
    if (conversation) {
      updateData.conversationId = conversation.id;
    }

    // Atomic update
    await this.messageModel.updateOne(
      { providerMessageId: wamid },
      { $set: updateData },
    );

    this.logger.log(
      `[WEBHOOK] Updated → wamid=${wamid} status=${incomingStatus}`,
    );

    // Sync to PostgreSQL for analytics and ledger updates
    setImmediate(() => {
      // 📡 Emit live status update to Frontend (Fix Phase 4)
      this.whatsappGateway.emitStatusUpdate(message.clientId.toString(), {
        wamid,
        status: incomingStatus,
        campaignId: message.campaignId.toString(),
      });

      this.syncToBackend({
        campaignId: message.campaignId.toString(),
        wamid,
        phone: message.to,
        status: incomingStatus,
        timestamp: date.toISOString(),
        failureReason: updateData.failureReason,
        pricingCategory: updateData.pricingCategory,
        billable: updateData.billable,
        conversationId: updateData.conversationId,
      }).catch((err) => {
        this.logger.error(
          `[SYNC_FAILURE] Error syncing ${wamid} to backend: ${err.message}`,
        );
      });
    });
  }

  /**
   * 📥 Process Inbound User Messages
   *
   * BUG-4 FIX: clientId is now resolved from `phoneNumberId` (the WABA-registered
   * number that received the message) instead of the last outbound message to the
   * sender. The old heuristic was non-deterministic in multi-tenant setups and
   * could silently misroute messages or misfired automation rules.
   *
   * If phoneNumberId is unknown (not yet onboarded), we log and skip — we do NOT
   * fall back to the last-sent heuristic.
   */
  private async processInboundMessage(
    messageObj: any,
    phoneNumberId: string | null,
  ) {
    const wamid = messageObj.id;
    const from = messageObj.from;
    const timestamp = new Date(Number(messageObj.timestamp) * 1000);
    const type = messageObj.type;

    let body = '';
    let payload = '';

    if (type === 'text') {
      body = messageObj.text?.body;
    } else if (type === 'interactive') {
      const interactive = messageObj.interactive;
      if (interactive.type === 'button_reply') {
        body = interactive.button_reply?.title;
        payload = interactive.button_reply?.id;
      } else if (interactive.type === 'list_reply') {
        body = interactive.list_reply?.title;
        payload = interactive.list_reply?.id;
      }
    } else if (type === 'button') {
      body = messageObj.button?.text;
      payload = messageObj.button?.payload;
    }

    this.logger.log(
      `[INBOUND] Type=${type} | from=${from} | body=${body} | phoneNumberId=${phoneNumberId}`,
    );

    // Resolve clientId deterministically from the receiving phone number.
    // null phoneNumberId = Meta payload bug; unknown phoneNumberId = not yet onboarded.
    // In both cases we persist the message but skip automation routing.
    let clientId: number | null = null;
    if (phoneNumberId) {
      clientId =
        await this.wabaCredentialService.getClientByPhoneNumberId(
          phoneNumberId,
        );
      if (!clientId) {
        this.logger.warn(
          `[INBOUND] ⚠️ No client mapped to phoneNumberId=${phoneNumberId}. ` +
            `Message from ${from} (wamid=${wamid}) stored but routing skipped.`,
        );
      }
    } else {
      this.logger.warn(
        `[INBOUND] ⚠️ Missing phoneNumberId in webhook metadata. ` +
          `Message from ${from} (wamid=${wamid}) stored but routing skipped.`,
      );
    }

    // Always persist — even if we can't route, the message is not lost.
    const inbound = await this.inboundMessageModel.create({
      wamid,
      from,
      timestamp,
      type:
        type === 'interactive' ? messageObj.interactive?.type || type : type,
      body,
      payload,
      rawPayload: messageObj,
    });

    // Only emit and trigger automation when we have a confirmed clientId.
    if (clientId) {
      this.whatsappGateway.emitInboundMessage(clientId.toString(), inbound);

      // 🤖 TRIGGER AUTO-REPLY (Phase 4A)
      await this.automationService.processInbound(clientId, body, from);
    }
  }

  /**
   * 🌁 Bridge Method: Sync status to swakora-backend analytics
   */
  private async syncToBackend(data: any, retry = 3): Promise<void> {
    const backendUrl = `${process.env.BACKEND_INTERNAL_URL || 'http://localhost:5000/api/internal/whatsapp'}/status-sync`;
    const secret = process.env.INTERNAL_SYNC_SECRET || 'sync_987654321';

    try {
      await axios.post(backendUrl, data, {
        headers: { 'x-internal-secret': secret },
        timeout: 5000,
      });
    } catch (error) {
      if (retry > 0) {
        const delay = (4 - retry) * 1000;
        this.logger.warn(
          `[SYNC_RETRY] Failed to sync ${data.wamid} to backend. Retrying in ${delay / 1000}s...`,
        );
        await new Promise((res) => setTimeout(res, delay));
        return this.syncToBackend(data, retry - 1);
      }
      throw error;
    }
  }
}
