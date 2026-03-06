import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";


export type MessageLogDocument = MessageLog & Document;

@Schema({ timestamps: true })
export class MessageLog {

    @Prop({ type: Types.ObjectId, required: true, index: true })
    messageId: Types.ObjectId;;

    @Prop({ type: Types.ObjectId, required: true, index: true })
    campaignId: Types.ObjectId;;

    @Prop({ type: Types.ObjectId, required: true })
    templateId: Types.ObjectId;;

    @Prop({ required: true })
    templateName: string;

    @Prop({ default: "failed" })
    status: "failed";

    @Prop({ required: true })
    sender: string;

    @Prop({ required: true })
    receiver: string;

    @Prop({ enum: ["transactional", "promotional"], required: true })
    route: "transactional" | "promotional";

    @Prop({ default: "IN" })
    country: string;

    @Prop({ required: true })
    error: string;

    @Prop({ required: true })
    errorCode: string;

    @Prop({ enum: ["system", "meta"], required: true })
    errorType: "system" | "meta";

    @Prop()
    errorReason?: string;

    @Prop({ required: true })
    submittedAt: Date;

    @Prop({ required: true })
    failedAt: Date;

    @Prop()
    providerTemplateId: string;

    @Prop()
    providerMessageId: String;

    @Prop()
    campaignName: string;
}

export const MessageLogSchema = SchemaFactory.createForClass(MessageLog);

MessageLogSchema.index({ campaignId: 1, failedAt: -1 });
MessageLogSchema.index({ errorType: 1, failedAt: -1 });