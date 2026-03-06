import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";


export type TemplateDocument = Template & Document;


@Schema({ timestamps: true })
export class Template {

    @Prop({ required: true })
    name: string;

    @Prop({ default: "whatsapp" })
    channel: string;

    @Prop({ default: "meta" })
    provider: string;

    @Prop({ required: true })
    language: string;

    @Prop({
        required: true,
        default: "pending"
    })
    status: "approved" | "pending" | "rejected";

    @Prop({
        enum: ["utility", "marketing", "authentication"],
        required: true
    })
    category: "utility" | "marketing" | "authentication";

    @Prop({ required: true })
    route: "transactional" | "promotional";

    @Prop()
    providerTemplateId?: string;
    

    @Prop({
        type: {
            header: {
                type: { type: String },
                text: { type: String }
            },
            body: { type: String, required: true },
            footer: { type: String },
            buttons: [
                {
                    type: { type: String },
                    text: { type: String },
                    url: { type: String },
                    phoneNumber: { type: String }
                }
            ]
        },
        required: true
    })
    components: {
        header?: { type: "TEXT"; text: string };
        body: string;
        footer?: string;
        buttons?: {
            type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
            text: string;
            url?: string;
            phoneNumber?: string;
        }[];
    };


    @Prop({ default: true })
    locked: boolean;

    @Prop({ default: false })
    isActive: boolean;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);