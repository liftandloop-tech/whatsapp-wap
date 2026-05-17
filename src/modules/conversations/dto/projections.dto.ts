import { MessageDirection, MessageType, MessageDeliveryStatus, MediaStatus } from '@prisma/client';

export class MessageProjectionDto {
  id: string;
  wamid: string | null;
  direction: MessageDirection;
  type: MessageType;
  textContent: string | null;
  status: MessageDeliveryStatus;
  
  // Media Fields
  mediaId?: string | null;
  mediaUrl?: string | null;
  mediaStatus?: MediaStatus | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  mediaFilename?: string | null;
  mediaCaption?: string | null;

  timestamp: Date;
}

export class ConversationProjectionDto {
  id: string;
  waId: string;
  lastMessageContent: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  state: string;
  lastCustomerMsgAt?: Date | null;
}

export class RealtimeEventDto {
  eventType: string;
  payload: any;
  traceId: string;
  tenantId: string;
  timestamp: Date;
}
