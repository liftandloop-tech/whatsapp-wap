import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*', // In production, restrict to your frontend domain
  },
})
export class WhatsappGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhatsappGateway.name);

  handleConnection(client: Socket) {
    const clientId = client.handshake.query.clientId;
    if (clientId) {
      client.join(`client_${clientId}`);
      this.logger.log(
        `Client connected: ${client.id} (Room: client_${clientId})`,
      );
    } else {
      this.logger.warn(`Client connected without clientId: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 📡 Broadcast Status Update
   *
   * Triggers when a webhook changes a message status (Read, Delivered, etc)
   */
  emitStatusUpdate(clientId: string, data: any) {
    this.server.to(`client_${clientId}`).emit('status_update', data);
  }

  /**
   * 📥 Incoming Message Notification
   *
   * Triggers when a customer replies to a message
   */
  emitInboundMessage(clientId: string | number, data: any) {
    this.server.to(`client_${clientId}`).emit('inbound_message', data);
  }

  /**
   * 🔔 General Client Event (Real-time Sync)
   *
   * Can be used for 'waba_connected', 'waba_error', etc.
   */
  emitToClient(clientId: string | number, eventName: string, data: any) {
    this.server.to(`client_${clientId}`).emit(eventName, data);
  }
}
