import {
  MessageType,
  MessageDirection,
  MessageDeliveryStatus,
  ConversationState,
} from '@prisma/client';

export class MessageProjectionDto {
  id: string;
  wamid: string | null;
  conversationId: string;
  direction: MessageDirection;
  type: MessageType;
  textContent: string | null;
  mediaLocalUrl: string | null;
  status: MessageDeliveryStatus;
  sentAt: Date;
  createdAt: Date;
}

export class ConversationProjectionDto {
  id: string;
  waId: string;
  contactName: string | null;
  state: ConversationState;
  unreadCount: number;
  lastMessageAt: Date | null;
  lastMessagePreview?: string;
}

export class RealtimeEventDto<T> {
  eventType: string;
  payload: T;
  traceId?: string;
  tenantId: string;
  timestamp: Date;
}
