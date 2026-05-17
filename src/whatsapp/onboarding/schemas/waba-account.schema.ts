import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { OnboardingState } from '../onboarding-state.enum';

export type WabaAccountDocument = WabaAccount & Document;

@Schema({ timestamps: true })
export class WabaAccount {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  businessId: string;

  __v?: number;

  @Prop({ required: true, index: true })
  wabaId: string;

  @Prop({ index: true })
  phoneNumberId?: string;

  @Prop({ index: true })
  phoneNumber?: string;

  @Prop()
  rawMetaStatus?: string;

  @Prop({
    type: String,
    enum: OnboardingState,
    default: OnboardingState.INIT,
    index: true,
  })
  status: OnboardingState;

  @Prop({ required: true })
  accessToken: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop({
    type: {
      code: String,
      message: String,
      timestamp: Date,
    },
  })
  lastError?: {
    code: string;
    message: string;
    timestamp: Date;
  };

  @Prop({
    type: {
      displayName: String,
      category: String,
      qualityRating: String, // NEW
    },
  })
  metadata?: {
    displayName?: string;
    category?: string;
    qualityRating?: string;
  };
}

export const WabaAccountSchema = SchemaFactory.createForClass(WabaAccount);

// Enforce unique number per WABA per Client
WabaAccountSchema.index({ clientId: 1, phoneNumberId: 1 }, { unique: true });
WabaAccountSchema.index({ clientId: 1, wabaId: 1 });
