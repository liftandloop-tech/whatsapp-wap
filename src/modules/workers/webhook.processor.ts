import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  ProcessingState,
  MessageDirection,
  MessageType,
  MessageDeliveryStatus,
} from '@prisma/client';
import {
  ConversationStateService,
  DomainEvent,
} from '../conversations/conversation-state.service';
import { OutboxService } from '../outbox/outbox.service';
import { TenantsService } from '../tenants/tenants.service';
import { TraceLogger } from '../../infra/observability/trace.logger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from '../../whatsapp/schemas/message.schema';
import { CampaignGuardService } from '../../whatsapp/services/campaign-guard.service';

@Processor('webhook', { concurrency: 10 })
export class WebhookProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private conversationStateService: ConversationStateService,
    private outboxService: OutboxService,
    private tenantsService: TenantsService,
    private logger: TraceLogger,
    @InjectQueue('media') private mediaQueue: Queue,
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
    private readonly campaignGuard: CampaignGuardService,
  ) {
    super();
    this.logger.setContext(WebhookProcessor.name);
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { eventId, traceId, tenantId } = job.data;
    this.logger.setTraceMetadata({ traceId, tenantId });
    this.logger.log(`Processing webhook event ${eventId}`);

    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      this.logger.error(`Webhook event ${eventId} not found in database`);
      return;
    }

    const payload = event.payload as any;

    try {
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value) continue;

          if (value.messages) {
            await this.handleInboundMessages(value, traceId);
          }

          if (value.statuses) {
            await this.handleStatusUpdates(value, traceId);
          }
        }
      }

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          processingState: ProcessingState.PROCESSED,
          processedAt: new Date(),
        },
      });

      this.logger.log(`Successfully processed event ${eventId}`);
      return { status: 'success' };
    } catch (error) {
      this.logger.error(`Failed to process event ${eventId}: ${error.message}`, error.stack);

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          processingState: ProcessingState.FAILED,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          lastError: error.message,
        },
      });

      throw error;
    }
  }

  private async handleInboundMessages(value: any, traceId: string) {
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const context = await this.tenantsService.findByPhoneNumberId(phoneNumberId);
    if (!context) {
      this.logger.warn(`No tenant found for phoneNumberId: ${phoneNumberId}`);
      return;
    }

    const { tenant, phoneNumber } = context;
    this.logger.setTraceMetadata({ tenantId: tenant.id });

    for (const message of value.messages) {
      const from = message.from;
      const wamid = message.id;
      const timestamp = new Date(parseInt(message.timestamp) * 1000);
      this.logger.setTraceMetadata({ wamid });

      await this.prisma.$transaction(async (tx) => {
        let conversation = await tx.conversation.findFirst({
          where: {
            tenantId: tenant.id,
            phoneNumberId: phoneNumber.id,
            waId: from,
          },
        });

        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              tenantId: tenant.id,
              phoneNumberId: phoneNumber.id,
              waId: from,
              state: 'NEW',
            },
          });
        }

        const nextState = this.conversationStateService.getNextState(
          conversation.state,
          DomainEvent.CUSTOMER_MESSAGE_RECEIVED,
          traceId,
        );

        const existingMessage = await tx.message.findUnique({
          where: { wamid },
        });

        if (existingMessage) {
          this.logger.warn(`Message ${wamid} already exists, skipping.`);
          return;
        }

        const mediaId = this.extractMediaId(message);
        const mediaFilename = message.document?.filename || message.audio?.filename || null;

        const newMessage = await tx.message.create({
          data: {
            tenantId: tenant.id,
            conversationId: conversation.id,
            wamid,
            direction: MessageDirection.INBOUND,
            type: this.mapMessageType(message.type),
            textContent: message.text?.body || message.image?.caption || message.video?.caption || '',
            mediaId,
            mediaFilename,
            mediaStatus: mediaId ? 'PENDING' : 'NONE',
            externalMetadata: message,
            metaTimestamp: timestamp,
          },
        });


        if (mediaId) {
          await this.mediaQueue.add('download', {
            messageId: newMessage.id,
            mediaId: mediaId,
            tenantId: tenant.id,
            traceId,
          }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          });
        }

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            state: nextState,
            lastCustomerMsgAt: timestamp,
            lastMessageAt: timestamp,
            unreadCount: { increment: 1 },
            conversationVersion: { increment: 1 },
          },
        });

        await this.outboxService.recordEvent(
          'message.received',
          {
            messageId: newMessage.id,
            conversationId: conversation.id,
            tenantId: tenant.id,
          },
          tx,
          {
            traceId,
            tenantId: tenant.id,
            aggregateId: conversation.id,
            aggregateType: 'Conversation',
          },
        );
      });
    }
  }

  private async handleStatusUpdates(value: any, traceId: string) {
    for (const status of value.statuses) {
      const wamid = status.id;
      const deliveryStatus = this.mapDeliveryStatus(status.status);
      const timestamp = new Date(parseInt(status.timestamp) * 1000);
      this.logger.setTraceMetadata({ wamid });

      // 1. Check if message exists in Prisma first (outside of transaction)
      const message = await this.prisma.message.findUnique({
        where: { wamid },
      });

      if (message) {
        // Only run a transaction if we actually need to update Prisma tables
        await this.prisma.$transaction(async (tx) => {
          await tx.messageStatusEvent.create({
            data: {
              messageId: message.id,
              status: deliveryStatus,
              rawPayload: status,
              metaTimestamp: timestamp,
            },
          });

          await this.outboxService.recordEvent(
            'message.status_updated',
            {
              messageId: message.id,
              wamid,
              status: deliveryStatus,
            },
            tx,
            {
              traceId,
              tenantId: message.tenantId,
              aggregateId: message.id,
              aggregateType: 'Message',
            },
          );
        });
        continue;
      }

      // 🔗 FALLBACK: Check MongoDB for Bulk/Campaign messages (entirely outside of Prisma transaction)
      try {
        const bulkMessage = await this.messageModel.findOne({ providerMessageId: wamid });
        if (bulkMessage) {
          const updateFields: any = { status: status.status };
          if (status.status === 'sent') updateFields.sentAt = timestamp;
          if (status.status === 'delivered') updateFields.deliveredAt = timestamp;
          if (status.status === 'read') updateFields.readAt = timestamp;
          if (status.status === 'failed') {
            updateFields.status = 'dead';
            updateFields.failureReason = status.errors?.[0]?.message || 'Meta Delivery Failure';
          }

          await this.messageModel.updateOne(
            { _id: bulkMessage._id },
            { $set: updateFields }
          );

          this.logger.log(`[BULK_STATUS] Updated campaign message ${wamid} to ${status.status}`);
          
          // Check campaign completion
          await this.campaignGuard.checkCompletion(bulkMessage.campaignId.toString());
          continue;
        }
      } catch (mongoErr) {
        this.logger.error(`Error checking MongoDB for wamid ${wamid}: ${mongoErr.message}`);
      }

      this.logger.warn(`Status update (${status.status}) for unknown message wamid: ${wamid}`);
    }
  }

  private mapMessageType(type: string): MessageType {
    const map: Record<string, MessageType> = {
      text: MessageType.TEXT,
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      document: MessageType.DOCUMENT,
      sticker: MessageType.STICKER,
      location: MessageType.LOCATION,
      contacts: MessageType.CONTACTS,
      interactive: MessageType.INTERACTIVE,
      reaction: MessageType.REACTION,
    };
    return map[type] || MessageType.TEXT;
  }

  private mapDeliveryStatus(status: string): MessageDeliveryStatus {
    const map: Record<string, MessageDeliveryStatus> = {
      sent: MessageDeliveryStatus.SENT,
      delivered: MessageDeliveryStatus.DELIVERED,
      read: MessageDeliveryStatus.READ,
      failed: MessageDeliveryStatus.FAILED,
    };
    return map[status] || MessageDeliveryStatus.SENT;
  }

  private extractMediaId(message: any): string | null {
    const type = message.type;
    return message[type]?.id || null;
  }
}
