import { Controller, Get, Post, Param, Query, ParseIntPipe, DefaultValuePipe, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConversationProjectionDto, MessageProjectionDto } from './dto/projections.dto';
import { OutboxService } from '../outbox/outbox.service';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private prisma: PrismaService,
    private outboxService: OutboxService,
  ) {}

  @Get()
  async listConversations(
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<ConversationProjectionDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return conversations.map(c => ({
      id: c.id,
      waId: c.waId,
      state: c.state,
      unreadCount: c.unreadCount,
      lastMessageAt: c.lastMessageAt,
      lastCustomerMsgAt: c.lastCustomerMsgAt,
      lastMessageContent: c.messages[0]?.textContent || (c.messages[0]?.type !== 'TEXT' ? `[${c.messages[0]?.type}]` : null),
    }));
  }

  @Get(':id')
  async getConversation(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return this.prisma.conversation.findUnique({
      where: { id, tenantId },
      include: { phoneNumber: true },
    });
  }

  @Get(':id/messages')
  async listMessages(
    @Param('id') conversationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<MessageProjectionDto[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        statusEvents: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    return messages.reverse().map(m => ({
      id: m.id,
      wamid: m.wamid,
      direction: m.direction,
      type: m.type,
      textContent: m.textContent,
      mediaId: m.mediaId,
      mediaUrl: m.mediaUrl,
      mediaStatus: m.mediaStatus,
      mediaMimeType: m.mediaMimeType,
      mediaSizeBytes: m.mediaSizeBytes,
      mediaFilename: m.mediaFilename,
      mediaCaption: m.mediaCaption,
      timestamp: m.metaTimestamp,
      status: (() => {
        if (m.direction === 'INBOUND') return 'READ';
        const statuses = new Set(m.statusEvents.map(e => e.status.toString()));
        if (statuses.has('READ')) return 'READ';
        if (statuses.has('DELIVERED')) return 'DELIVERED';
        if (statuses.has('FAILED')) return 'FAILED';
        return 'SENT';
      })(),
    }));
  }

  @Post(':id/sync')
  async syncConversation(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    // 1. Fetch latest state
    const conversation = await this.prisma.conversation.findUnique({
      where: { id, tenantId },
    });

    if (!conversation) throw new BadRequestException('Conversation not found');

    const messages = await this.listMessages(id, 50);

    // 2. Record sync event in outbox (this triggers RealtimeGateway)
    await this.outboxService.recordEvent(
      'conversation.sync',
      {
        conversationId: id,
        messages,
        conversation: {
          id: conversation.id,
          state: conversation.state,
          unreadCount: conversation.unreadCount,
          lastMessageAt: conversation.lastMessageAt,
        },
      },
      this.prisma, // No transaction needed here as it's a read-then-record
      {
        tenantId,
        aggregateId: id,
        aggregateType: 'Conversation',
      }
    );

    return { status: 'sync_triggered' };
  }
}
