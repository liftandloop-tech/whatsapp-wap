import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { MetaComponentDto } from "../dto/create-template.dto";


@Schema({ timestamps: true })
export class Template {

    @Prop({ required: true, unique: true })
    name: string;

    @Prop({ required: true })
    language: string;

    @Prop({
        enum: ["utility", "marketing", "authentication"],
        required: true
    })
    category: "utility" | "marketing" | "authentication";

    @Prop({ default: "whatsapp" })
    channel: string;

    @Prop({ default: "meta" })
    provider: string;

    @Prop({ 
        required: true,
        enum: ["transactional" , "promotional"]
    })
    route: "transactional" | "promotional";

    @Prop({
        enum: ["approved", "pending", "rejected"],
        default: "pending",
        required: true
    })
    status: "approved" | "pending" | "rejected";

    @Prop()
    providerTemplateId?: string;

    @Prop({ 
        required : true,
        type: Array 
    })
    components: MetaComponentDto[];

    @Prop({ 
        required: true, 
        default: true
    })
    isActive: boolean;

}


export const TemplateSchema = SchemaFactory.createForClass(Template);