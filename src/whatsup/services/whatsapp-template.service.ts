import { Injectable } from "@nestjs/common";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import { Template } from "../schemas/template.schema1";
import { WhatsappTemplateProvider } from "../providers/whatsapp-template.provider";
import { CreateTemplateDto, TemplateComponentDto } from "../dto/create-template.dto1";
import { TEMPLATE_STATUS } from "../constants/template.constants";
import { channel } from "diagnostics_channel";


@Injectable()
export class WhatsappTemplateService {

    constructor(
        @InjectModel(Template.name)
        private templateModel: Model<Template>,

        private whatsappTemplateProvider: WhatsappTemplateProvider
    ) { }



    async createTemplate(payload: CreateTemplateDto) {
        try {
            const route = payload.category === "marketing" ? "promotional" : "transactional";

            const template_data = {
                name: payload.name,
                language: payload.language,
                category: payload.category,
                route,
                status: TEMPLATE_STATUS.PENDING,
                channel: "whatsapp",
                provider: "meta",
                components: payload.components,
                locked: true,
                isActive: false
            }

            const template = await this.templateModel.create(template_data);

            const metaRes = await this.whatsappTemplateProvider.createTemplate(template);

            if (!metaRes.success) {
                let metaError = metaRes.error;
                if (typeof metaError === "object") {
                    if (metaError.error?.message) {
                        metaError = metaError.error.message;
                    }
                    else {
                        metaError = JSON.stringify(metaError);
                    }
                }
                throw new Error(metaError);
            }

            await this.templateModel.updateOne(
                { _id: template._id },
                { $set: { providerTemplateId: metaRes.data.name } }
            );

            const updatedTemplate = await this.templateModel.findById(
                { _id: template._id }
            )

            return {
                success: true,
                message: "Template created successfully and submitted for Meta approval",
                status: 200,
                data: {
                    template: updatedTemplate
                }
            }

        }
        catch (err) {
            console.log(err);
            return {
                success: false,
                message: "Template creation failed",
                status: 500,
                error: err?.message || JSON.stringify(err)
            }
        }
    }


}