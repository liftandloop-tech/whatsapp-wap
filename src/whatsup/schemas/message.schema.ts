import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";


export type MessageDocument = Message & Document;


@Schema({ timestamps: true })
export class Message {

    @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
    campaignId: Types.ObjectId;

    @Prop({ required: true })
    from: string;

    @Prop({ required: true })
    to: string;

    @Prop({ required: true })
    content: string;

    @Prop({
        enum: ["template"],
        default: "template"
    })
    type: "template";

    @Prop({
        enum: ["queued", "processing", "sent", "failed", "dead"],
        default: "queued",
        index: true
    })
    status: "queued" | "processing" | "sent" | "failed" | "dead";

    @Prop({ 
        enum: ["whatsapp"],
        default: "whatsapp",
    })
    channel: string;

    @Prop({ required: true })
    batchNo: number;

    @Prop({ type: Date, required: true, index: true })
    availableAt: Date;

    @Prop({ default: 0 })
    retryCount: number;

    @Prop({ type: Date })
    sentAt?: Date;

    @Prop({ type: Date })
    deliveredAt?: Date;

    @Prop({ index: true })
    providerMessageId?: string;

    @Prop({ type: Number, index: true })
    workerId?: number;

    @Prop({ type: Date, index: true })
    processingAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ status: 1, availableAt: 1 });
MessageSchema.index({ status: 1, retryCount: 1 });
MessageSchema.index({ status: 1, processingAt: 1 });
MessageSchema.index({ workerId: 1, status: 1 });