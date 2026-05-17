import { Controller, Post, Get, Body, Query, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MessageDirection, MessageType, OutboxState } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { TemplateSyncService } from '../whatsapp/template-sync.service';

@Controller('messages')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private prisma: PrismaService,
    private templateSyncService: TemplateSyncService,
  ) {}


  @Get('templates')
  async listTemplates(@Query('tenantId') tenantId: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return this.prisma.messageTemplate.findMany({
      where: { tenantId, status: 'APPROVED' },
      include: { components: true },
      orderBy: { name: 'asc' },
    });
  }

  @Post('send')
  async sendMessage(
    @Body() body: { tenantId: string; conversationId: string; text: string },
  ) {
    const { tenantId, conversationId, text } = body;

    if (!text) throw new BadRequestException('Message text is required');

    // 1. Validate session and tenant
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId, tenantId },
      include: { phoneNumber: true },
    });

    if (!conversation) throw new BadRequestException('Conversation not found');

    // 2. Meta 24h Session Enforcement
    const lastInbound = conversation.lastCustomerMsgAt;
    const isWithin24h = 
      lastInbound && 
      (new Date().getTime() - lastInbound.getTime()) <= 24 * 60 * 60 * 1000;

    if (!isWithin24h) {
      throw new BadRequestException({
        code: 'SESSION_EXPIRED',
        message: 'The 24h session window is closed. You must use a template to re-open it.',
      });
    }

    const traceId = uuidv4();

    // 2. Transactional Append: Message (Intent) + Outbox (Event)
    return this.prisma.$transaction(async (tx) => {
      // Append the message with OUTBOUND direction
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          textContent: text,
          metaTimestamp: new Date(),
        },
      });

      // Append Outbox event for background dispatch
      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'message.send',
          traceId,
          aggregateId: message.id,
          aggregateType: 'Message',
          state: OutboxState.PENDING,
          payload: {
            messageId: message.id,
            conversationId: conversation.id,
            to: conversation.waId,
            text: text,
            phoneNumberId: conversation.phoneNumber.phoneNumberId,
          },
        },
      });

      return {
        status: 'accepted',
        messageId: message.id,
        traceId,
      };
    });
  }

  @Post('send-template')
  async sendTemplate(
    @Body() body: { 
      tenantId: string; 
      conversationId: string; 
      templateId: string;
      variables?: Record<string, string>;
    },
  ) {
    const { tenantId, conversationId, templateId, variables } = body;

    // 1. Fetch template and conversation
    const [template, conversation] = await Promise.all([
      this.prisma.messageTemplate.findUnique({
        where: { id: templateId, tenantId },
        include: { components: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: conversationId, tenantId },
        include: { phoneNumber: true },
      }),
    ]);

    if (!template) throw new BadRequestException('Template not found');
    if (!conversation) throw new BadRequestException('Conversation not found');

    const traceId = uuidv4();

    // 2. Transactional Append
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEMPLATE,
          textContent: `Template: ${template.name}`, // Fallback text
          metaTimestamp: new Date(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'message.template_send',
          traceId,
          aggregateId: message.id,
          aggregateType: 'Message',
          state: OutboxState.PENDING,
          payload: {
            messageId: message.id,
            conversationId: conversation.id,
            to: conversation.waId,
            templateName: template.name,
            languageCode: template.language,
            phoneNumberId: conversation.phoneNumber.phoneNumberId,
            variables, // Dynamic data
          },
        },
      });

      return {
        status: 'accepted',
        messageId: message.id,
        traceId,
      };
    });
  }

  @Post('sync-templates')
  async syncTemplates(@Body() body: { tenantId: string }) {
    if (!body.tenantId) throw new BadRequestException('tenantId is required');
    await this.templateSyncService.syncTemplates(body.tenantId);
    return { status: 'success' };
  }
  @Post('send-media')
  async sendMedia(
    @Body() body: { 
      tenantId: string; 
      conversationId: string; 
      type: 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
      mediaId: string;
      caption?: string;
      filename?: string;
      mediaUrl?: string;
    },

  ) {
    const fs = require('fs');
    fs.appendFileSync('/Users/harshmodi/Desktop/wap/whatsapp-wap/scratch/request_log.txt', `[${new Date().toISOString()}] [SEND_MEDIA] Body: ${JSON.stringify(body)}\n`);
    this.logger.log(`[SEND_MEDIA] Received request: ${JSON.stringify(body)}`);
    const { tenantId, conversationId, type, mediaId, caption, filename, mediaUrl } = body;



    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId, tenantId },
      include: { phoneNumber: true },
    });

    if (!conversation) throw new BadRequestException('Conversation not found');

    const traceId = uuidv4();

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          direction: MessageDirection.OUTBOUND,
          type: type as MessageType,
          mediaId,
          mediaUrl,
          mediaCaption: caption,
          mediaFilename: filename,
          metaTimestamp: new Date(),
        },
      });


      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'message.media_send',
          traceId,
          aggregateId: message.id,
          aggregateType: 'Message',
          state: OutboxState.PENDING,
          payload: {
            messageId: message.id,
            conversationId: conversation.id,
            to: conversation.waId,
            type: type.toLowerCase(),
            mediaId,
            caption,
            filename,
            phoneNumberId: conversation.phoneNumber.phoneNumberId,
          },
        },
      });

      return {
        status: 'accepted',
        messageId: message.id,
        traceId,
      };
    });
  }
}
