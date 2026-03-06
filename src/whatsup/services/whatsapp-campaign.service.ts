import { Model, Types } from "mongoose";
import { MESSAGE_STATUS } from "../constants/message.constants";
import { CreateCampaignDto } from "../dto/create-campaign.dto";
import { CAMPAIGN_STATUS } from "../constants/campaign.constants";
import { InjectModel } from "@nestjs/mongoose";
import { Campaign } from "../schemas/campaign.schema";
import { Message } from "../schemas/message.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { Template } from "../schemas/template.schema1";




@Injectable()
export class WhatsappCampaignService {

    constructor(
        @InjectModel(Message.name)
        private messageModel: Model<Message>,

        @InjectModel(Campaign.name)
        private campaignModel: Model<Campaign>,

        @InjectModel(Template.name)
        private templateModel: Model<Template>
    ) { }

    // methods


  // Template validation
    private async validateTemplate(templateId: string) {
        if (!Types.ObjectId.isValid(templateId)) {
            throw new BadRequestException("Invalid templateId");
        }

        const template = await this.templateModel.findOne({
            _id: new Types.ObjectId(templateId),
            channel: "whatsapp",
            status: "approved",
        });

        if (!template) {
            throw new BadRequestException(
                "WhatsApp template not found or not approved"
            );
        }

        if (template.category === "utility") {
            template.route = "transactional";
        }
        else if (template.category === "marketing") {
            template.route = "promotional";
        }
        else {
            template.route = "transactional";
        }

        return template;
    }



    // createCampaign
    async createCampaign(payload: CreateCampaignDto) {

        // TEMPLATE VALIDATION FIRST
        const template = await this.validateTemplate(payload.templateId);


        // campaign
        const campaign_data = {
            templateId: template._id,
            name: payload.name,
            from: payload.from,
            content: payload.content,
            channel: "whatsapp",
            totalRecipients: payload.recipients.length,
            isSplit: payload.isSplit,
            batchSize: payload.isSplit ? payload.batchSize : 0,
            intervalSeconds: payload.isSplit ? payload.intervalSeconds : 0
        }

        // For saving as DRAFT   //
        if (payload.status === CAMPAIGN_STATUS.DRAFT) {
            const draft_campaign_data = {
                status: CAMPAIGN_STATUS.DRAFT,
                scheduleAt: payload.scheduleAt
            };
            const campaign_data_with_draft = { ...campaign_data, ...draft_campaign_data };
            const res = await this.campaignModel.create(campaign_data_with_draft);
            return {
                success: true,
                totalRecipients: payload.recipients.length,
                data: res
            }
        }
    
        // For saving as SEND  //
        const queue_campaign_data = {
            status: CAMPAIGN_STATUS.QUEUED,
            scheduleAt: payload.scheduleAt ?? new Date(),
            sentAt: new Date()
        }

        const campaign_data_with_queue = { ...campaign_data, ...queue_campaign_data};

        const campaign_res = await this.campaignModel.create(campaign_data_with_queue);
        const campaignId = campaign_res._id;

        const DB_CHUNK_SIZE = 5000;

        // message
        if (!payload.isSplit) {
            let index = 0;
            let count = 0;
            let batchNo = 1;
            const availableAt = payload.scheduleAt ?? new Date();

            while (index < payload.recipients.length) {
                count += await this.insertMessages(payload, index, DB_CHUNK_SIZE, campaignId, batchNo, availableAt);
                index += DB_CHUNK_SIZE;
            }
        }
        else {
            const LOGICAL_BATCH_SIZE = payload.batchSize || 5000;
            const intervalSeconds = payload.intervalSeconds ?? 0;

            let index = 0;
            let logicalCount = 0;
            let count = 0;
            let batchNo = 1;

            while (index < payload.recipients.length) {
                const baseTime = payload.scheduleAt ? new Date(payload.scheduleAt).getTime() : Date.now();
                const availableAt = new Date(baseTime + batchNo * intervalSeconds * 1000);

                count += await this.insertMessages(
                    payload,
                    index,
                    DB_CHUNK_SIZE,
                    campaignId,
                    batchNo,
                    availableAt
                );

                index += DB_CHUNK_SIZE;
                logicalCount += DB_CHUNK_SIZE;

                //  batch changes ONLY on logical boundary
                if (logicalCount >= LOGICAL_BATCH_SIZE) {
                    batchNo++;
                    logicalCount = 0;
                }
            }
        }

        return {
            success: true,
            totalRecipients: payload.recipients.length,
            data: campaign_res
        };
    }

    private async insertMessages(payload: CreateCampaignDto,
        index: number,
        BATCH_SIZE: number,
        campaignId: Types.ObjectId,
        batchNo: number,
        availableAt: Date
    ) {

        const recipients = payload.recipients.slice(index, index + BATCH_SIZE);

        const docs = recipients.map(to =>
        ({
            from: payload.from,
            content: payload.content,
            to,
            type: "template",
            status: MESSAGE_STATUS.QUEUED,
            channel: "whatsapp",
            campaignId,
            batchNo,
            availableAt
        }));

        const message_res = await this.messageModel.insertMany(docs);
        console.log("message_res = ", message_res.length);
        return message_res.length;
    }

}    