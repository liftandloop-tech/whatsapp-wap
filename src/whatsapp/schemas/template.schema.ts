import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Template {
  @Prop({ type: Number, required: true, index: true })
  clientId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  language: string;

  @Prop({
    enum: ['utility', 'marketing', 'authentication'],
    required: true,
  })
  category: 'utility' | 'marketing' | 'authentication';

  @Prop({ default: 'whatsapp' })
  channel: string;

  @Prop({ default: 'meta' })
  provider: string;

  @Prop({
    required: true,
    enum: ['transactional', 'promotional'],
  })
  route: 'transactional' | 'promotional';

  @Prop({
    enum: [
      'APPROVED',
      'PENDING',
      'REJECTED',
      'IN_REVIEW',
      'PAUSED',
      'DISABLED',
      'PENDING_DELETION',
      'DELETED',
      'LIMIT_REACHED',
      'APPEAL_REQUESTED',
      'REINSTATED',
      'DRAFT',
    ],
    default: 'PENDING',
    required: true,
  })
  status: string;

  @Prop()
  providerTemplateId?: string;

  // ✅ FIXED HERE
  @Prop({
    required: true,
    type: [MongooseSchema.Types.Mixed],
  })
  components: any[];

  @Prop({
    required: true,
    default: true,
  })
  isActive: boolean;

  @Prop()
  dltTemplateId?: string;

  @Prop({ type: Number })
  ttlSeconds?: number;

  @Prop({ type: Boolean, default: false })
  clickTracking?: boolean;

  /** Unix timestamp (ms) of the last successfully applied Meta event.
   *  Used by the timestamp-guarded upsert to discard stale/out-of-order events. */
  @Prop({ type: Number })
  lastEventTs?: number;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
TemplateSchema.index({ clientId: 1, name: 1, language: 1 }, { unique: true });
// Performance index for the timestamp-guarded upsert query in TemplateWebhookProcessor.
// Without this, high webhook volume => collection scan on every update => queue backlog.
// Pattern: { clientId, name, language, lastEventTs: { $lt: incomingTs } }
TemplateSchema.index({ clientId: 1, name: 1, language: 1, lastEventTs: 1 });
