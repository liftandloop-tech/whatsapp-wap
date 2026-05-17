import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProcessedEventDocument = ProcessedEvent & Document;

/**
 * 🛡️ ProcessedEvent — Permanent Deduplication Guard
 *
 * Provides DB-level idempotency beyond BullMQ's transient jobId scope.
 * When a job completes and is removed from the queue, BullMQ's dedup expires.
 * If Meta replays the same event later, this collection catches it.
 *
 * Unique index on `eventHash` (sha256 of raw payload).
 * Processor inserts here FIRST — if it throws 11000 (duplicate), event is skipped.
 */
@Schema({ timestamps: true })
export class ProcessedEvent {
  /** sha256 of the raw Meta webhook payload for this event */
  @Prop({ required: true, unique: true, index: true })
  eventHash: string;

  /** Composite event identity key: wabaId:templateName:language:event:timestamp */
  @Prop({ required: true, index: true })
  eventId: string;

  /** The WABA ID from the webhook payload */
  @Prop()
  wabaId: string;

  /** Template name from the event */
  @Prop()
  templateName: string;

  /** Meta event type: APPROVED, REJECTED, DISABLED, etc. */
  @Prop()
  event: string;
}

export const ProcessedEventSchema =
  SchemaFactory.createForClass(ProcessedEvent);
