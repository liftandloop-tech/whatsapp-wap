import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InboundMessageDocument = InboundMessage & Document;

@Schema({ timestamps: true })
export class InboundMessage {
  // ✅ ADD THIS
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  wamid: string;

  @Prop({ required: true, index: true })
  from: string; // sender number

  // ✅ ADD THIS (for bidirectional chat)
  @Prop({ index: true })
  to?: string;

  @Prop({ required: true, index: true })
  timestamp: Date;

  @Prop({
    required: true,
    enum: [
      'text',
      'button_reply',
      'list_reply',
      'image',
      'document',
      'audio',
      'video',
      'unsupported',
    ],
    default: 'text',
  })
  type: string;

  // message body
  @Prop()
  body?: string;

  // button/list payload
  @Prop()
  payload?: string;

  // ✅ ADD THIS (for unread count)
  @Prop({ default: 'RECEIVED', index: true })
  status?: string;

  @Prop({ type: Object })
  rawPayload: any;
}

export const InboundMessageSchema =
  SchemaFactory.createForClass(InboundMessage);

// indexes
InboundMessageSchema.index({ clientId: 1, from: 1, createdAt: -1 });
