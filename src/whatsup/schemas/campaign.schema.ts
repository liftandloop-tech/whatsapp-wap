import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";


export type CampaignDocument = Campaign & Document;

@Schema({ timestamps: true })
export class Campaign {

    @Prop({ type: Types.ObjectId, ref: "Template", required: true })
    templateId: Types.ObjectId;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    from: string;

    @Prop({ default: "whatsapp" })
    channel: string;

    @Prop({ default: "IN" })
    country: string;

    @Prop({
        enum: ["queued", "processing", "completed", "failed", "draft"],
        default: "queued",
        index: true
    })
    status: "queued" | "processing" | "completed" | "failed" | "draft";

    @Prop({ required: true })
    totalRecipients: number;

    @Prop({ default: false })
    isSplit: boolean;

    @Prop({ default: 0 })
    batchSize: number;

    @Prop({ default: 0 })
    intervalSeconds: number;

    @Prop()
    scheduleAt?: Date;

    @Prop()
    sentAt?: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

CampaignSchema.index({ status: 1, scheduleAt: 1 });
CampaignSchema.index({ templateId: 1, createdAt: -1 });