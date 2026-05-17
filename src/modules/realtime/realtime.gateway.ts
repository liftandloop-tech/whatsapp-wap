import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  MessageProjectionDto,
  ConversationProjectionDto,
  RealtimeEventDto,
} from './dto/projections.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private prisma: PrismaService) {}

  handleConnection(client: Socket) {
    const tenantId = client.handshake.query.tenantId as string;

    if (!tenantId) {
      this.logger.warn(
        `Client ${client.id} attempted to connect without tenantId. Disconnecting.`,
      );
      client.disconnect();
      return;
    }

    // Join tenant-scoped room
    client.join(`tenant:${tenantId}`);
    this.logger.log(`Client ${client.id} connected to tenant:${tenantId}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe_to_conversation')
  handleSubscribeToConversation(
    client: Socket,
    data: { conversationId: string },
  ) {
    if (data.conversationId) {
      client.join(`conversation:${data.conversationId}`);
      this.logger.log(
        `Client ${client.id} subscribed to conversation:${data.conversationId}`,
      );
    }
  }

  /**
   * Internal Event Listeners
   */

  @OnEvent('message.received')
  async handleMessageReceived(payload: any) {
    const { tenantId, traceId } = payload._metadata;
    const { messageId, conversationId } = payload;
    
    this.logger.log(`[${traceId}] Broadcasting message.received to tenant:${tenantId} and conversation:${conversationId}`);

    const broadcastPayload = {
      eventType: 'message.received',
      payload: { messageId, conversationId },
      traceId,
      tenantId,
      timestamp: new Date(),
    };

    this.server.to(`tenant:${tenantId}`).to(`conversation:${conversationId}`).emit('message.received', broadcastPayload);

    // Also broadcast conversation update (Projection)
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (conversation) {
      this.server.to(`tenant:${tenantId}`).emit('conversation.updated', {
        eventType: 'conversation.updated',
        payload: {
          id: conversation.id,
          state: conversation.state,
          unreadCount: conversation.unreadCount,
          lastMessageAt: conversation.lastMessageAt,
        } as ConversationProjectionDto,
        traceId,
        tenantId,
        timestamp: new Date(),
      });
    }
  }

  @OnEvent('message.status_updated')
  async handleMessageStatusUpdated(payload: any) {
    const { tenantId, traceId } = payload._metadata;
    const { messageId, wamid, status } = payload;
    
    // We need conversationId for targeted broadcast. Let's fetch it.
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true }
    });

    this.logger.log(`[${traceId}] Broadcasting message.status_updated`);

    const broadcastPayload = {
      eventType: 'message.status_updated',
      payload: { messageId, wamid, status },
      traceId,
      tenantId,
      timestamp: new Date(),
    };

    if (message?.conversationId) {
      this.server.to(`tenant:${tenantId}`).to(`conversation:${message.conversationId}`).emit('message.status_updated', broadcastPayload);
    } else {
      this.server.to(`tenant:${tenantId}`).emit('message.status_updated', broadcastPayload);
    }
  }

  @OnEvent('message.media_updated')
  async handleMessageMediaUpdated(payload: any) {
    const { tenantId, traceId } = payload._metadata;
    const { messageId, conversationId, mediaUrl, mediaStatus } = payload;
    
    this.logger.log(`[${traceId}] Broadcasting message.media_updated`);

    const broadcastPayload = {
      eventType: 'message.media_updated',
      payload: { messageId, conversationId, mediaUrl, mediaStatus },
      traceId,
      tenantId,
      timestamp: new Date(),
    };

    this.server.to(`tenant:${tenantId}`).to(`conversation:${conversationId}`).emit('message.media_updated', broadcastPayload);
  }

  @OnEvent('conversation.sync')
  async handleConversationSync(payload: any) {
    const { tenantId, traceId } = payload._metadata;
    const { conversationId, messages, conversation } = payload;

    this.logger.log(`[${traceId}] Broadcasting conversation.sync for ${conversationId}`);

    const broadcastPayload = {
      eventType: 'conversation.sync',
      payload: { conversationId, messages, conversation },
      traceId,
      tenantId,
      timestamp: new Date(),
    };

    this.server.to(`conversation:${conversationId}`).emit('conversation.sync', broadcastPayload);
  }
}
