import { Model, Types } from 'mongoose';
import { MESSAGE_STATUS } from '../constants/message.constants';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { CAMPAIGN_STATUS } from '../constants/campaign.constants';
import { InjectModel } from '@nestjs/mongoose';
import { Campaign } from '../schemas/campaign.schema';
import { Message } from '../schemas/message.schema';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Template } from '../schemas/template.schema';
import { WhatsappQueueService } from './whatsapp-queue.service';
import { TEMPLATE_STATUS } from '../constants/template.constants';

import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class WhatsappCampaignService {
  private readonly logger = new Logger(WhatsappCampaignService.name);

  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<Message>,

    @InjectModel(Campaign.name)
    private campaignModel: Model<Campaign>,

    @InjectModel(Template.name)
    private templateModel: Model<Template>,

    private readonly queueService: WhatsappQueueService,
    private readonly prisma: PrismaService,
  ) {}

  // Template validation
  private async validateTemplate(templateId: string) {
    let template;

    // Try MongoDB first for legacy fallback (in case frontend passes ObjectID)
    if (Types.ObjectId.isValid(templateId)) {
      template = await this.templateModel.findOne({
        _id: new Types.ObjectId(templateId),
        channel: 'whatsapp',
        status: TEMPLATE_STATUS.APPROVED,
      });
    }

    // Try PostgreSQL if it's a CUID
    if (!template) {
      const pgTemplate = await this.prisma.messageTemplate.findUnique({
        where: { id: templateId, status: 'APPROVED' },
        include: { components: true },
      });
      if (pgTemplate) {
        // Map to expected structure
        template = {
          _id: pgTemplate.id,
          dltTemplateId: (pgTemplate as any).dltTemplateId || null,
          components: pgTemplate.components,
        };
      }
    }

    if (!template) {
      throw new BadRequestException(
        'WhatsApp template not found or not approved in DB',
      );
    }

    return template;
  }

  // createCampaign
  async createCampaign(payload: CreateCampaignDto) {
    // 1. Double Idempotency Check (Prevent duplicate trigger)
    const existing = await this.campaignModel.findOne({ name: payload.name });
    if (existing && existing.status === CAMPAIGN_STATUS.QUEUED) {
      throw new BadRequestException(
        'A campaign with this name is already queued.',
      );
    }

    // 2. TEMPLATE VALIDATION
    const template = await this.validateTemplate(payload.templateId);

    // 🚨 2.5 DLT Compliance (India Specialization)
    if (payload.country === 'IN' && !template.dltTemplateId) {
      throw new BadRequestException(
        'DLT compliance error: dltTemplateId is required for campaigns sent within India.',
      );
    }

    // 🚨 2.6 Extract Media ID Fallback from Template Components
    // If payload.mediaId is null, check if the template header has a pre-synced mediaId
    let effectiveMediaId = payload.mediaId;
    if (!effectiveMediaId && template.components) {
      const header = template.components.find((c: any) => c.type?.toUpperCase() === 'HEADER');
      if (header?.mediaId) {
        effectiveMediaId = header.mediaId;
        this.logger.debug(`[CAMPAIGN] Using template default mediaId: ${effectiveMediaId}`);
      }
    }

    // 3. Campaign Data Preparation
    const campaign_data = {
      clientId: payload.clientId,
      templateId: template._id,
      name: payload.name,
      from: payload.from,
      content: payload.content,
      channel: 'whatsapp',
      totalRecipients: payload.recipients.length,
      isSplit: payload.isSplit,
      batchSize: payload.isSplit ? payload.batchSize : 0,
      intervalSeconds: payload.isSplit ? payload.intervalSeconds : 0,
      mediaId: effectiveMediaId,
    };

    // 4. Draft Logic
    if (payload.status === CAMPAIGN_STATUS.DRAFT) {
      const campaign = await this.campaignModel.create({
        ...campaign_data,
        status: CAMPAIGN_STATUS.DRAFT,
        scheduleAt: payload.scheduleAt,
      });
      return {
        success: true,
        totalRecipients: payload.recipients.length,
        data: campaign,
      };
    }

    // 5. Queued Logic (The Send Path)
    const campaign = await this.campaignModel.create({
      ...campaign_data,
      status: CAMPAIGN_STATUS.QUEUED,
      scheduleAt: payload.scheduleAt ?? new Date(),
      sentAt: new Date(),
    });

    const campaignId = campaign._id;
    const DB_CHUNK_SIZE = 5000;

    // 6. Message Insertion + Queue Offboarding
    if (!payload.isSplit) {
      let index = 0;
      const availableAt = payload.scheduleAt ?? new Date();

      while (index < payload.recipients.length) {
        const insertedMessages = await this.insertMessages(
          payload,
          index,
          DB_CHUNK_SIZE,
          campaignId,
          1,
          availableAt,
          effectiveMediaId,
        );

        const delay = Math.max(0, availableAt.getTime() - Date.now());

        // PUSH TO DISTRIBUTED QUEUE
        await this.queueService.addBulkMessages(
          campaignId.toString(),
          insertedMessages.map((m) => ({
            messageId: m._id.toString(),
            phone: m.to,
            variables: m.variables,
            templateId: template._id.toString(), // ✅ Fix #5: Required by BulkProcessor cache lookup
            phoneNumberId: payload.from, // ✅ Fix #5: Required by rate limiter + Meta dispatch
            from: m.from,
            mediaId: m.mediaId,
          })),
          delay,
        );

        index += DB_CHUNK_SIZE;
      }
    } else {
      const LOGICAL_BATCH_SIZE = payload.batchSize || 5000;
      const intervalSeconds = payload.intervalSeconds ?? 0;

      let index = 0;
      let logicalCount = 0;
      let batchNo = 1;

      while (index < payload.recipients.length) {
        const baseTime = payload.scheduleAt
          ? new Date(payload.scheduleAt).getTime()
          : Date.now();
        const availableAt = new Date(
          baseTime + batchNo * intervalSeconds * 1000,
        );

        const insertedMessages = await this.insertMessages(
          payload,
          index,
          DB_CHUNK_SIZE,
          campaignId,
          batchNo,
          availableAt,
          effectiveMediaId,
        );

        const delay = Math.max(0, availableAt.getTime() - Date.now());

        // PUSH TO DISTRIBUTED QUEUE (Preserving Batch Scheduling)
        await this.queueService.addBulkMessages(
          campaignId.toString(),
          insertedMessages.map((m) => ({
            messageId: m._id.toString(),
            phone: m.to,
            variables: m.variables,
            templateId: template._id.toString(), // ✅ Fix #5
            phoneNumberId: payload.from, // ✅ Fix #5
            from: m.from,
            mediaId: m.mediaId,
          })),
          delay,
        );

        index += DB_CHUNK_SIZE;
        logicalCount += DB_CHUNK_SIZE;

        if (logicalCount >= LOGICAL_BATCH_SIZE) {
          batchNo++;
          logicalCount = 0;
        }
      }
    }

    return {
      success: true,
      totalRecipients: payload.recipients.length,
      data: campaign,
    };
  }

  private async insertMessages(
    payload: CreateCampaignDto,
    index: number,
    BATCH_SIZE: number,
    campaignId: Types.ObjectId,
    batchNo: number,
    availableAt: Date,
    effectiveMediaId?: string | null,
  ) {
    const recipients = payload.recipients.slice(index, index + BATCH_SIZE);

    const docs = recipients.map((recipient) => ({
      clientId: payload.clientId,
      from: payload.from,
      content: payload.content,
      to: recipient.phone,
      variables: recipient.vars || [],
      mediaId: effectiveMediaId || null,
      type: 'template',
      status: MESSAGE_STATUS.QUEUED,
      channel: 'whatsapp',
      campaignId,
      batchNo,
      availableAt,
    }));

    const result = await this.messageModel.insertMany(docs);
    this.logger.log(
      `[DB] Inserted ${result.length} messages for campaign ${campaignId}`,
    );
    return result;
  }
}
