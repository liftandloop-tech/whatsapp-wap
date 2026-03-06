import { Injectable, OnModuleInit } from "@nestjs/common";
import { Campaign } from "../schemas/campaign.schema";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CAMPAIGN_STATUS } from "../constants/campaign.constants";
import { Message } from "../schemas/message.schema";
import { MESSAGE_STATUS } from "../constants/message.constants";


@Injectable()
export class CampaignWorker implements OnModuleInit {

    constructor(
        @InjectModel(Campaign.name)
        private readonly campaignModel: Model<Campaign>,
        @InjectModel(Message.name)
        private readonly messageModel: Model<Message>
    ) { }

    onModuleInit() {
        console.log("Cmapaign Worker initialiazed");
        this.start();
    }


    private async start() {
        console.log("Campaign Worker Started");

        while (true) {
            console.log("Campaign Worker Heartbeat");

            const campaigns = await this.getCampaigns();
            for (const camp of campaigns) {
                await this.processCampaign(camp);
            }
            await this.sleep(20000);
        }
    }


    private getCampaigns = async () => {
        const now = new Date();

        return await this.campaignModel.find(
            {
                status: {
                    $in: [
                        CAMPAIGN_STATUS.QUEUED,
                        CAMPAIGN_STATUS.PROCESSING
                    ]    
                } ,   
                scheduleAt: { $lte: now }
            }
        );
    }


    private processCampaign = async (campaign: any) => {
        const campId = campaign._id;

        const noOfMessages = await this.messageModel.countDocuments(
            {
                campaignId: campId,
                status: {
                    $nin: [
                        MESSAGE_STATUS.SENT,
                        MESSAGE_STATUS.DEAD
                    ]
                }
            }
        );

        if (noOfMessages > 0) {
            await this.campaignModel.updateOne(
                { _id: campId, status: CAMPAIGN_STATUS.QUEUED },
                { status: CAMPAIGN_STATUS.PROCESSING }
            );
        }
        else{
            await this.campaignModel.updateOne(
                { _id: campId, status: { $ne: CAMPAIGN_STATUS.COMPLETED }},
                { $set: { status: CAMPAIGN_STATUS.COMPLETED}}
            )
        }
    }



    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

}