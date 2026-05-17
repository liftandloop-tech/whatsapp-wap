import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { OnboardingState } from '../onboarding-state.enum';

@Schema({ timestamps: true })
export class OnboardingAuditLog {
  @Prop({ required: true, index: true })
  wabaId: string;

  @Prop({ required: true, enum: OnboardingState })
  fromState: OnboardingState;

  @Prop({ required: true, enum: OnboardingState })
  toState: OnboardingState;

  @Prop({ required: true, enum: ['API', 'WEBHOOK', 'SYSTEM'] })
  triggeredBy: string;

  @Prop()
  metadata?: string; // JSON string of extra info / error details

  @Prop({ index: true })
  triggeredAt: Date;
}

export type OnboardingAuditLogDocument = OnboardingAuditLog & Document;
export const OnboardingAuditLogSchema =
  SchemaFactory.createForClass(OnboardingAuditLog);
